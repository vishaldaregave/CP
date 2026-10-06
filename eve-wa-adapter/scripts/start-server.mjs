import { startVeriqooServer } from "../agent/verification/apiServer.ts";

const PORT = Number(process.env.PORT || process.env.VERIQOO_PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";

startVeriqooServer(PORT, HOST);
