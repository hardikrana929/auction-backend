const validateImageBuffer = (buffer, mimeType) => {
    if (!buffer || !Buffer.isBuffer(buffer)) return false;

    const signatures = {
        "image/jpeg": [
            [0xff, 0xd8, 0xff],
        ],
        "image/png": [
            [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
        ],
    };

    return (signatures[mimeType] || []).some((signature) =>
        signature.every((byte, index) => buffer[index] === byte)
    );
};

module.exports = { validateImageBuffer };
