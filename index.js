const express = require("express");
const app = express();
require("dotenv").config();
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const port = process.env.PORT || 5000;

// middleware
const corsOptions = {
  origin: [
    "http://localhost:5173",
    "http://localhost:5174",
    "https://contest-hub-c5704.web.app",
    "https://contest-hub-c5704.firebaseapp.com",
  ],
  credentials: true,
  optionSuccessStatus: 200,
};
app.use(cors(corsOptions));

app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.s1le0vj.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    const db = client.db("Contest-Hub");
    const popularCollection = db.collection("popular");
    const advertiseCollection = db.collection("advertise");
    const creatorsCollection = db.collection("creators");
    const contestCollection = db.collection("contests");
    const usersCollection = db.collection("users");

    // jwt related api
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1h",
      });
      res.send({ token });
    });

    // middlewares
    const verifyToken = (req, res, next) => {
      // console.log('inside verify token', req.headers.authorization);
      if (!req.headers.authorization) {
        return res.status(401).send({ message: "unauthorized access" });
      }
      const token = req.headers.authorization.split(" ")[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: "unauthorized access" });
        }
        req.decoded = decoded;
        next();
      });
    };

    // use verify admin after verifyToken
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      const isAdmin = user?.role === "admin";
      if (!isAdmin) {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    // use verify creator after verifyToken
    const verifyCreator = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      const isCreator = user?.role === "creator";
      if (!isCreator) {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    // users related api
    // get all users data from db
    app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    // get a user info by email from db
    app.get("/user/:email", async (req, res) => {
      const email = req.params.email;
      const result = await usersCollection.findOne({ email });
      res.send(result);
    });

    //update a user role
    app.patch(
      "/users/update/:email",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const email = req.params.email;
        const user = req.body;
        const query = { email };
        const updateDoc = {
          $set: { ...user, timestamp: Date.now() },
        };
        const result = await usersCollection.updateOne(query, updateDoc);
        res.send(result);
      }
    );

    //update a user status
    app.patch(
      "/users/status/update/:email",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const email = req.params.email;
        const user = req.body;
        const query = { email };
        const updateDoc = {
          $set: { ...user, timestamp: Date.now() },
        };
        const result = await usersCollection.updateOne(query, updateDoc);
        res.send(result);
      }
    );

    // delete a user
    app.delete(
      "/users/delete/:email",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const email = req.params.email;
        const query = { email };
        const result = await usersCollection.deleteOne(query);
        res.send(result);
      }
    );

    // app.get("/users/admin/:email", verifyToken, async (req, res) => {
    //   const email = req.params.email;

    //   if (email !== req.decoded.email) {
    //     return res.status(403).send({ message: "forbidden access" });
    //   }

    //   const query = { email: email };
    //   const user = await usersCollection.findOne(query);
    //   let admin = false;
    //   if (user) {
    //     admin = user?.role === "admin";
    //   }
    //   res.send({ admin });
    // });
    // app.get("/users/creator/:email", verifyToken, async (req, res) => {
    //   const email = req.params.email;

    //   if (email !== req.decoded.email) {
    //     return res.status(403).send({ message: "forbidden access" });
    //   }

    //   const query = { email: email };
    //   const user = await usersCollection.findOne(query);
    //   let creator = false;
    //   if (user) {
    //     creator = user?.role === "creator";
    //   }
    //   res.send({ creator });
    // });

    // save a user data in db
    app.put("/user", async (req, res) => {
      const user = req.body;

      const query = { email: user?.email };
      // check if user already exists in db
      const isExist = await usersCollection.findOne(query);
      if (isExist) {
        return res.send(isExist);
      }

      // save user for the first time
      const options = { upsert: true };
      const updateDoc = {
        $set: {
          ...user,
          timestamp: Date.now(),
        },
      };
      const result = await usersCollection.updateOne(query, updateDoc, options);
      res.send(result);
    });

    // Fetch all contests
    app.get("/contests", async (req, res) => {
      const contests = await contestCollection.find({}).toArray();
      // console.log(contests);
      res.send(contests);
    });

    // Delete a contest
    app.delete("/contests/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await contestCollection.deleteOne(query);
      res.send(result);
    });

    // Confirm and publish a contest
    app.patch("/contests/confirm/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          status: "confirmed",
          published: true,
        },
      };
      const result = await contestCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    // Add a comment to a contest
    app.post("/contests/comment/:id", async (req, res) => {
      const id = req.params.id;
      const comment = req.body.comment;
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $push: {
          comments: comment,
        },
      };
      const result = await contestCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    // get all popular data from popular collection
    app.get("/popular", async (req, res) => {
      const result = await popularCollection.find().toArray();
      // console.log(result);
      res.send(result);
    });

    // Get a single popular data from db using _id
    app.get("/popular/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await popularCollection.findOne(query);
      res.send(result);
    });

    // get all advertise data from  db
    app.get("/advertise", async (req, res) => {
      const result = await advertiseCollection.find().toArray();
      // console.log(result);
      res.send(result);
    });

    // get all creators data from  db
    app.get("/creators", async (req, res) => {
      const result = await creatorsCollection.find().toArray();
      // console.log(result);
      res.send(result);
    });

    // add a contest data in db
    app.post("/contests", verifyToken, verifyCreator, async (req, res) => {
      const contestData = req.body;
      const userEmail = contestData?.creator?.email;
      const query = { email: userEmail };
      const user = await usersCollection.findOne(query);
      const isBlocked = user?.status === "Blocked";
      console.log(isBlocked);
      if (isBlocked) {
        return res
          .status(401)
          .send({ message: "You are blocked by the admin panel" });
      }
      const result = await contestCollection.insertOne(contestData);
      res.send(result);
    });
    // get all contest for creator
    app.get(
      "/contests/user/:email",
      verifyToken,
      verifyCreator,
      async (req, res) => {
        const email = req.params.email;

        let query = { "creator.email": email };
        const result = await contestCollection.find(query).toArray();
        res.send(result);
      }
    );

    // delete a contest
    app.delete(
      "/contests/:id",
      verifyToken,
      verifyCreator,
      async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await contestCollection.deleteOne(query);
        res.send(result);
      }
    );

    // get single contest for creator
    app.get("/contest/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await contestCollection.findOne(query);
      res.send(result);
    });

    // update contest data
    app.put(
      "/contest/update/:id",
      verifyToken,
      verifyCreator,
      async (req, res) => {
        const id = req.params.id;
        console.log(id);
        const contestData = req.body;
        const query = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: contestData,
        };
        const result = await contestCollection.updateOne(query, updateDoc);
        res.send(result);
      }
    );

    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello World!");
});
app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
