const { io } = require("socket.io-client");

const socket = io(
    "http://localhost:5000"
);

socket.on("connect", () => {
    console.log(
        "Connected:",
        socket.id
    );

    socket.emit(
        "auction:join",
        {
            auctionId:
                "6a94e6973ee0a79a58dc7d17",
        }
    );
});

socket.on(
    "auction:joined",
    (data) => {
        console.log(
            "Joined auction:",
            data
        );
    }
);

socket.on(
    "auction:started",
    (data) => {
        console.log(
            "Auction started:",
            data
        );
    }
);

socket.on(
    "bid:new",
    (data) => {
        console.log(
            "NEW BID:",
            data
        );
    }
);

socket.on(
    "player:sold",
    (data) => {
        console.log(
            "PLAYER SOLD:",
            data
        );
    }
);

socket.on(
    "player:unsold",
    (data) => {
        console.log(
            "PLAYER UNSOLD:",
            data
        );
    }
);

socket.on(
    "auction:next-player",
    (data) => {
        console.log(
            "NEXT PLAYER:",
            data
        );
    }
);

socket.on(
    "auction:error",
    (data) => {
        console.log(
            "Auction error:",
            data
        );
    }
);