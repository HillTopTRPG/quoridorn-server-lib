const cors = require('cors');
const express = require('express');
const bodyParser = require('body-parser');

export function makeExpressServer(port: number): { expressServer: any, io: any } {
  const expressServer = express();
  expressServer.use(bodyParser.json({
    inflate: true,
    limit: '100kb',
    type: 'application/json',
    strict: true
  }));
  expressServer.use(cors({
    origin: true,
    credentials: true,
    methods: ["GET", "POST", "DELETE"],
    allowedHeaders: "authorization",
    exposedHeaders: ["Content-Disposition", "Content-Type"]
  }));

  const http = require("http");
  const httpServer = http.createServer(expressServer);
  httpServer.listen(port);

  const io = require("socket.io")(httpServer, {
    cors: {
      origin: "*",
      credentials: true
    }
  });

  return { expressServer, io };
}
