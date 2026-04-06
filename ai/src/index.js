import dotenv from "dotenv";
import { createApp } from "./app.js";

dotenv.config();

const port = Math.max(Number(process.env.PORT || 8080) || 8080, 1);
const app = createApp();

app.listen(port, () => {
  console.log(`[journex-ai] listening on :${port}`);
});
