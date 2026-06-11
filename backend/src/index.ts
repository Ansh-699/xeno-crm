import express from "express";
import cors from "cors";
import customersRouter from "./routes/customers";
import ordersRouter from "./routes/orders";
import receiptsRouter from "./routes/receipts";
import campaignsRouter from "./routes/campaigns";
import segmentsRouter from "./routes/segments";
import agentRouter from "./routes/agent";
import analyticsRouter from "./routes/analytics";
import insightsRouter from "./routes/insights";
import statsRouter from "./routes/stats";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: "50mb" }));

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "xeno-crm" });
});

app.use("/api/customers", customersRouter);
app.use("/api/orders", ordersRouter);
app.use("/api/receipts", receiptsRouter);
app.use("/api/campaigns", campaignsRouter);
app.use("/api/segments", segmentsRouter);
app.use("/api/agent", agentRouter);
app.use("/api/analytics", analyticsRouter);
app.use("/api/insights", insightsRouter);
app.use("/api/stats", statsRouter);

app.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
});

export default app;
