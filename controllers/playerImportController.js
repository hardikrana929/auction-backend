const mongoose = require("mongoose");
const ExcelJS = require("exceljs");

const Auction = require("../models/Auction");
const AuctionSession = require("../models/AuctionSession");
const Player = require("../models/Player");
const asyncHandler = require("../utils/asyncHandler");
const {
  COLUMNS,
  MAX_IMPORT_ROWS,
  duplicateKey,
  parsePlayerRows,
} = require("../utils/playerImport");
const { reserveAuctionNumbers } = require("../utils/playerNumbers");

const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// An .xlsx file is a ZIP container: it always starts with "PK".
const looksLikeXlsx = (buffer) =>
  Buffer.isBuffer(buffer) &&
  buffer.length > 4 &&
  buffer[0] === 0x50 &&
  buffer[1] === 0x4b;

// ExcelJS returns rich objects for hyperlinks, formulas and rich text.
const cellToValue = (value) => {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if (Array.isArray(value.richText))
      return value.richText.map((part) => part.text).join("");
    if (value.result !== undefined) return cellToValue(value.result);
    if (value.text !== undefined) return cellToValue(value.text);
    if (value.hyperlink) return value.hyperlink;
    return "";
  }
  return value;
};

// Sheet -> array of rows (first row = headers)
const sheetToRows = (worksheet) => {
  const columnCount = Math.min(worksheet.columnCount || 0, COLUMNS.length + 10);
  const rowCount = Math.min(worksheet.rowCount || 0, MAX_IMPORT_ROWS + 50);
  const rows = [];
  for (let rowNumber = 1; rowNumber <= rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    rows.push(
      Array.from({ length: columnCount }, (_, index) =>
        cellToValue(row.getCell(index + 1).value),
      ),
    );
  }
  return rows;
};

/*
|--------------------------------------------------------------------------
| GET /api/players/import/format
| JSON description of the Excel format (shown by the "File format" button).
|--------------------------------------------------------------------------
*/
const getImportFormat = (req, res) => {
  const required = COLUMNS.filter((column) => column.required);
  res.status(200).json({
    success: true,
    totalColumns: COLUMNS.length,
    requiredColumns: required.length,
    optionalColumns: COLUMNS.length - required.length,
    maxRows: MAX_IMPORT_ROWS,
    fileType: ".xlsx (Excel)",
    columns: COLUMNS.map((column) => ({
      header: column.header,
      required: column.required,
      example: column.example,
      note: column.note || "",
      options: column.options || [],
    })),
  });
};

/*
|--------------------------------------------------------------------------
| GET /api/players/import/template  - sample .xlsx
|--------------------------------------------------------------------------
*/
const downloadImportTemplate = asyncHandler(async (req, res) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "AuctionPro";

  const sheet = workbook.addWorksheet("Players");
  sheet.columns = COLUMNS.map((column) => ({
    header: column.header,
    key: column.key,
    width: Math.max(14, column.header.length + 4),
  }));

  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  COLUMNS.forEach((column, index) => {
    header.getCell(index + 1).fill = {
      type: "pattern",
      pattern: "solid",
      // required columns are dark red, optional ones are slate
      fgColor: { argb: column.required ? "FFB91C1C" : "FF475569" },
    };
  });

  const example = (shift) =>
    Object.fromEntries(
      COLUMNS.map((column) => [
        column.key,
        column.key === "fullName"
          ? ["Rohit", "Virat"][shift]
          : column.key === "lastName"
            ? ["Sharma", "Kohli"][shift]
            : column.key === "role"
              ? ["Batsman", "All Rounder"][shift]
              : column.example,
      ]),
    );
  sheet.addRow(example(0));
  sheet.addRow(example(1));
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  const guide = workbook.addWorksheet("Instructions");
  guide.columns = [
    { header: "Column", key: "header", width: 24 },
    { header: "Required", key: "required", width: 12 },
    { header: "Allowed values / notes", key: "note", width: 90 },
  ];
  guide.getRow(1).font = { bold: true };
  COLUMNS.forEach((column) =>
    guide.addRow({
      header: column.header,
      required: column.required ? "Yes" : "No",
      note: column.options?.length
        ? column.options.join(", ")
        : column.note || "",
    }),
  );
  guide.addRow({});
  guide.addRow({
    header: `Fill the "Players" sheet. Delete the two example rows. Maximum ${MAX_IMPORT_ROWS} players per file.`,
  });

  const buffer = await workbook.xlsx.writeBuffer();
  res.setHeader("Content-Type", XLSX_CONTENT_TYPE);
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="player-import-format.xlsx"',
  );
  res.status(200).send(Buffer.from(buffer));
});

/*
|--------------------------------------------------------------------------
| POST /api/players/import   (multipart: file + auctionId)
| Valid rows are imported, invalid rows are reported with their row number.
|--------------------------------------------------------------------------
*/
const importPlayers = asyncHandler(async (req, res) => {
  const { auctionId } = req.body;

  if (!req.file) {
    return res
      .status(400)
      .json({ success: false, message: "Choose an Excel (.xlsx) file to import" });
  }
  if (!looksLikeXlsx(req.file.buffer)) {
    return res.status(400).json({
      success: false,
      message: "This file is not a valid Excel .xlsx workbook",
    });
  }
  if (!mongoose.Types.ObjectId.isValid(auctionId)) {
    return res.status(400).json({ success: false, message: "Invalid auction ID" });
  }

  const auction = await Auction.findById(auctionId);
  if (!auction)
    return res.status(404).json({ success: false, message: "Auction not found" });
  if (auction.status === "cancelled") {
    return res.status(400).json({
      success: false,
      message: "Cannot import players into a cancelled auction",
    });
  }

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(req.file.buffer);
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: "The Excel file could not be read. Download the sample file and try again.",
    });
  }

  const worksheet = workbook.getWorksheet("Players") || workbook.worksheets[0];
  if (!worksheet) {
    return res.status(400).json({ success: false, message: "The Excel file has no sheets" });
  }

  const existing = await Player.find({ auction: auctionId })
    .select("fullName lastName villageTown auctionOrder")
    .lean();
  const existingKeys = new Set(existing.map(duplicateKey));

  const parsed = parsePlayerRows(sheetToRows(worksheet), auction, existingKeys);
  if (parsed.fatal) {
    return res.status(400).json({ success: false, message: parsed.fatal });
  }

  let imported = 0;
  if (parsed.valid.length) {
    const firstNumber = await reserveAuctionNumbers(auctionId, parsed.valid.length);
    const lastOrder = existing.reduce(
      (max, player) => Math.max(max, Number(player.auctionOrder || 0)),
      0,
    );

    const docs = parsed.valid.map(({ data }, index) => ({
      ...data,
      auction: auctionId,
      auctionNumber: firstNumber + index,
      auctionOrder: lastOrder + index + 1,
      category: "auction",
      status: "available",
      registrationSource: "admin",
    }));

    const inserted = await Player.insertMany(docs);
    imported = inserted.length;

    // Players added while the auction is running join the live queue.
    if (auction.status === "live" && imported) {
      await AuctionSession.updateOne(
        { auction: auctionId },
        { $inc: { totalPlayers: imported } },
      );
    }
  }

  res.status(imported ? 201 : 200).json({
    success: true,
    message: imported
      ? `${imported} player(s) imported${parsed.errors.length ? `, ${parsed.errors.length} row(s) skipped` : ""}.`
      : "No players were imported.",
    totalRows: parsed.total,
    imported,
    skipped: parsed.errors.length,
    errors: parsed.errors.slice(0, 200),
  });
});

module.exports = { getImportFormat, downloadImportTemplate, importPlayers };
