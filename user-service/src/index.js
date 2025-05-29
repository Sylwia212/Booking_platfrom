const express = require("express");
const app = express();

const PORT = process.env.PORT || 3003; 

app.use(express.json());


app.get("/api/status", (req, res) => {
  res.status(200).json({ status: "User Service is running" });
});


app.post("/users/register", (req, res) => {
  res.status(501).json({ message: "Not Implemented: User Registration" });
});

app.post("/users/login", (req, res) => {
  res.status(501).json({ message: "Not Implemented: User Login" });
});

app.get("/users/me", (req, res) => {
  res.status(501).json({ message: "Not Implemented: Get Current User" });
});

app.listen(PORT, () => {
  console.log(`User Service listening on port ${PORT}`);
});
