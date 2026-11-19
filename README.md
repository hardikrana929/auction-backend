# AuctionPro – Backend (`auction-backend`)

REST API and real-time bidding server for **AuctionPro**, an IPL-style live cricket player auction platform.
Built with **Node.js, Express, MongoDB (Mongoose) and Socket.IO**.

## Features

- Role-based access: **Super Admin**, **Admin**, **User** (team owner)
- JWT authentication with hashed passwords
- Player and team management (photo / logo upload)
- Dynamic form fields for the Add Player and Add Team forms
- Auction control: create, start, pause, end, mark **SOLD / UNSOLD**
- Real-time bidding with Socket.IO (server validates every bid)
- Automatic purse deduction and squad update after each sale
- Bid history and auction results

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js (LTS) |
| Framework | Express.js |
| Database | MongoDB Atlas + Mongoose |
| Real-time | Socket.IO |
| Auth | JSON Web Token (JWT), bcrypt |
| Uploads | Multer |

## Prerequisites

- Node.js 18 or later and npm
- A MongoDB database (MongoDB Atlas free cluster or local MongoDB)
- Git

## Setup

```bash
# 1. Clone the repository
git clone <your-backend-repo-url>
cd auction-backend

# 2. Install dependencies
npm install

# 3. Create the environment file
cp .env.example .env
#    then open .env and fill in the values (see below)

# 4. Start in development mode (auto-restart)
npm run dev

# or start normally
npm start
```

The API runs at `http://localhost:5000` by default.

### Environment variables

Create a `.env` file in the project root:

```env
PORT=5000
NODE_ENV=development

# MongoDB connection string (Atlas or local)
MONGO_URI=mongodb+srv://<username>:<password>@<cluster-host>/auctionpro?retryWrites=true&w=majority

# Auth
JWT_SECRET=change_this_to_a_long_random_string
JWT_EXPIRES_IN=7d

# Allowed front-end origin (CORS + Socket.IO)
CLIENT_URL=http://localhost:5173
```

> Never commit `.env`. Add it to `.gitignore` and keep a `.env.example` with placeholder values only.

### MongoDB Atlas checklist

1. Create a cluster and a database user.
2. Add your IP address under **Network Access** (or `0.0.0.0/0` for testing only).
3. Copy the connection string into `MONGO_URI`.

### Creating the first Super Admin

Create the first Super Admin account using your seed script (for example `npm run seed`) or by inserting one user document with `role: "superadmin"` and a bcrypt-hashed password. After that, the Super Admin can create Admins from the application.

## NPM Scripts

| Script | Description |
|---|---|
| `npm start` | Run the server with Node |
| `npm run dev` | Run the server with nodemon |
| `npm run seed` | (Optional) Seed the Super Admin / sample data |

## Folder Structure

```text
auction-backend/
├── src/
│   ├── config/
│   │   └── db.js                 # MongoDB connection
│   ├── models/
│   │   ├── User.js               # users: name, email, password, role, team
│   │   ├── Team.js               # teams: name, logo, purse, owner, players
│   │   ├── Player.js             # players: name, photo, category, basePrice, status ...
│   │   ├── Auction.js            # auctions: status, currentPlayer, currentBid ...
│   │   ├── Bid.js                # bids: auction, player, team, amount
│   │   └── FormField.js          # dynamic field definitions for player / team forms
│   ├── controllers/              # request handling / business logic
│   │   ├── authController.js
│   │   ├── userController.js
│   │   ├── playerController.js
│   │   ├── teamController.js
│   │   ├── auctionController.js
│   │   └── formFieldController.js
│   ├── routes/                   # Express routers
│   │   ├── authRoutes.js
│   │   ├── userRoutes.js
│   │   ├── playerRoutes.js
│   │   ├── teamRoutes.js
│   │   ├── auctionRoutes.js
│   │   └── formFieldRoutes.js
│   ├── middleware/
│   │   ├── auth.js               # verify JWT
│   │   ├── role.js               # role-based access (superadmin / admin / user)
│   │   ├── upload.js             # Multer (photos, logos)
│   │   └── errorHandler.js
│   ├── sockets/
│   │   └── auctionSocket.js      # Socket.IO bidding events
│   ├── utils/                    # helpers (token, validators ...)
│   ├── app.js                    # Express app, middleware, routes
│   └── server.js                 # HTTP + Socket.IO server bootstrap
├── uploads/                      # uploaded player photos and team logos
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

> The tree above is the intended layout. If your folders or file names differ, update this section to match the repository.

## API Overview

Base URL: `http://localhost:5000/api`

| Module | Typical operations | Access |
|---|---|---|
| Auth | Register, login, current user | Public / logged in |
| Users | List, create admin, change role, activate / deactivate | Super Admin |
| Form fields | Create, update, delete, order dynamic fields | Super Admin |
| Players | Create, list, get, update, delete | Admin, Super Admin (list: all roles) |
| Teams | Create, list, get, update, delete, squad | Admin, Super Admin (list: all roles) |
| Auctions | Create, start, pause, end, next player, mark SOLD / UNSOLD | Admin, Super Admin |
| Results | Sold / unsold list, team summary | All roles |

Send the token on protected routes:

```http
Authorization: Bearer <token>
```

Refer to the API endpoints reference document of the project for the exact paths, request bodies and responses.

## Real-time Events (Socket.IO)

Clients connect to the same server URL and join the auction room. Typical events:

| Event | Direction | Purpose |
|---|---|---|
| `joinAuction` | client → server | Join the live auction room |
| `placeBid` | client → server | Team owner places a bid |
| `bidUpdate` | server → clients | New highest bid and bidding team |
| `playerSold` / `playerUnsold` | server → clients | Result for the current player |
| `auctionStatus` | server → clients | Started / paused / completed |

> Event names are indicative. Keep this table in sync with `src/sockets/auctionSocket.js`.

## Business Rules

- A bid must be at least the current bid plus the configured increment (or the base price for the first bid).
- A team cannot bid more than its remaining purse.
- Only an Admin or Super Admin can mark a player SOLD / UNSOLD.
- Only a Super Admin can create Admins or change dynamic form configuration.

## Deployment Notes

- Set `NODE_ENV=production` and all environment variables on the host (Render, Railway, VPS, etc.).
- Set `CLIENT_URL` to the deployed front-end URL so CORS and Socket.IO accept it.
- Persist the `uploads/` folder, or move uploads to cloud storage (for example Cloudinary or S3) because many hosts have temporary disks.
- Use a process manager such as PM2 on a VPS.
