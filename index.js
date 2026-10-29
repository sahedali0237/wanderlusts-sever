import "dotenv/config";
import express from "express";
import cors from "cors";
import { MongoClient, ObjectId } from "mongodb";
import { requireAuth } from "./middleware/auth.js";
import { auth } from "./src/lib/auth.js";
import { toNextJsHandler } from "better-auth/integrations/next-js";

const app = express();

// Explicitly allow PATCH, PUT, DELETE methods in CORS
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);
app.use(express.json());

const port = process.env.PORT || 5000;
const client = new MongoClient(process.env.MONGODB_URI);

export async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("You successfully connected to MongoDB!");
    return client;
  } catch (err) {
    console.error("Failed to connect to MongoDB", err);
  }
}

connectToMongoDB().catch(console.error);

// Protected routes - require valid JWT
app.post("/destination", requireAuth, async (req, res) => {
  try {
    console.log("Received data:", req.body);

    const db = client.db("travelDB");
    const collection = db.collection("destinations");

    const result = await collection.insertOne(req.body);

    res.status(201).json({
      message: "Data saved successfully!",
      insertedId: result.insertedId,
    });
  } catch (error) {
    console.error("MongoDB insert error:", error);

    res.status(500).json({
      message: "Failed to save data",
      error: error.message,
    });
  }
});

app.get("/destination", async (req, res) => {
  try {
    const db = client.db("travelDB");
    const collection = db.collection("destinations");
    const result = await collection.find().toArray();
    res.json(result);
  } catch (error) {
    console.error("MongoDB query error:", error);
    res.status(500).json({
      message: "Failed to retrieve destinations",
      error: error.message,
    });
  }
});

app.get("/destination/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid Destination ID format" });
    }

    const db = client.db("travelDB");
    const collection = db.collection("destinations");
    const result = await collection.findOne({ _id: new ObjectId(id) });

    if (!result) {
      return res.status(404).json({ message: "Destination not found" });
    }

    res.json(result);
  } catch (error) {
    console.error("MongoDB query error:", error);
    res.status(500).json({
      message: "Failed to retrieve destination",
      error: error.message,
    });
  }
});

app.patch("/destination/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    console.log("Incoming PATCH for ID:", id, "Payload:", req.body);

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: `Invalid Destination ID: ${id}` });
    }

    const { _id, ...updateData } = req.body;

    const db = client.db("travelDB");
    const collection = db.collection("destinations");

    const result = await collection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updateData },
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: "Destination not found" });
    }

    console.log("Successfully updated document:", id);
    res.json({
      message: "Destination updated successfully",
      result,
    });
  } catch (error) {
    console.error("MongoDB update error:", error);
    res.status(500).json({
      message: "Failed to update destination",
      error: error.message,
    });
  }
});

app.delete("/destination/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: `Invalid Destination ID: ${id}` });
    }

    const db = client.db("travelDB");
    const collection = db.collection("destinations");

    const result = await collection.deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      return res.status(404).json({ message: "Destination not found" });
    }

    console.log("Successfully deleted document:", id);
    res.json({
      message: "Destination deleted successfully",
      result,
    });
  } catch (error) {
    console.error("MongoDB delete error:", error);
    res.status(500).json({
      message: "Failed to delete destination",
      error: error.message,
    });
  }
});

app.post("/booking", requireAuth, async (req, res) => {
  try {
    const data = req.body;
    const authEmail = req.user?.email;

    if (!authEmail) {
      return res.status(401).json({ error: "Token is missing an email claim" });
    }

    // Prevent creating bookings for another user
    if (
      data.user?.email &&
      data.user.email.toLowerCase() !== authEmail.toLowerCase()
    ) {
      return res
        .status(403)
        .json({ error: "You can only create bookings for your own account" });
    }

    // Always bind the booking to the authenticated user
    data.user = { ...(data.user ?? {}), email: authEmail };

    const db = client.db("travelDB");
    const collection = db.collection("bookings");

    const result = await collection.insertOne(data);

    res.status(201).json({
      message: "Booking created successfully!",
      insertedId: result.insertedId,
    });
  } catch (error) {
    console.error("Error inserting booking:", error);
    res.status(500).json({ message: "Failed to process booking" });
  }
});

app.get("/my-booking/:email", requireAuth, async (req, res) => {
  try {
    const email = req.params.email;
    const authEmail = req.user?.email;

    if (!email) {
      return res.status(400).json({ message: "Email parameter is required" });
    }

    if (!authEmail) {
      return res.status(401).json({ error: "Token is missing an email claim" });
    }

    if (email.toLowerCase() !== authEmail.toLowerCase()) {
      return res
        .status(403)
        .json({ error: "You can only view your own bookings" });
    }

    const db = client.db("travelDB");
    const collection = db.collection("bookings");

    const result = await collection.find({ "user.email": authEmail }).toArray();

    res.status(200).json({ bookings: result });
  } catch (error) {
    console.error("Error fetching bookings:", error);
    res.status(500).json({ message: "Failed to fetch bookings" });
  }
});

app.delete("/booking/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { email } = req.body;
    const authEmail = req.user?.email;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: `Invalid Booking ID: ${id}` });
    }

    if (!authEmail) {
      return res.status(401).json({ error: "Token is missing an email claim" });
    }

    // Body email is optional; if supplied it must match the token
    if (email && email.toLowerCase() !== authEmail.toLowerCase()) {
      return res
        .status(403)
        .json({ error: "Email does not match the authenticated user" });
    }

    const db = client.db("travelDB");
    const collection = db.collection("bookings");

    const booking = await collection.findOne({ _id: new ObjectId(id) });

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    if (booking.user?.email?.toLowerCase() !== authEmail.toLowerCase()) {
      return res.status(403).json({
        message: "Forbidden: You cannot delete someone else's booking",
      });
    }

    await collection.deleteOne({ _id: new ObjectId(id) });

    res.status(200).json({
      message: "Booking deleted successfully",
    });
  } catch (error) {
    console.error("MongoDB delete error:", error);
    res.status(500).json({
      message: "Failed to delete booking",
      error: error.message,
    });
  }
});

// Auth routes via better-auth /api/auth/[...all]
const authHandler = toNextJsHandler(auth);
app.all("/api/auth/*", async (req, res) => {
  try {
    const url = new URL(req.originalUrl || req.url, `http://${req.headers.host || "localhost"}`);
    const method = req.method.toLowerCase();
    const request = new Request(url, {
      method: req.method,
      headers: new Headers(req.headers),
      body: ["get", "head"].includes(req.method.toLowerCase()) ? undefined : JSON.stringify(req.body),
    });

    const handler = authHandler[method] || authHandler.get || authHandler.post;
    if (!handler) return res.status(404).json({ message: "Not found" });

    const response = await handler(request);
    const responseBody = response.body ? await response.json() : null;
    res.status(response.status).json(responseBody);
  } catch (error) {
    console.error("Auth route error:", error);
    res.status(500).json({ error: "Auth route error" });
  }
});

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.listen(port, () => {
  console.log(`Server initialized on port ${port}`);
});
export default app;
