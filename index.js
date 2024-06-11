const express = require("express");
const app = express();
require("dotenv").config();
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
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
    const advertiseCollection = db.collection("advertise");
    const contestCollection = db.collection("contests");
    const usersCollection = db.collection("users");
    const paymentsCollection = db.collection("payments");

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

    //update a user
    app.put("/users/:email", verifyToken, async (req, res) => {
      const userEmail = req.params.email;
      const updateData = req.body;
      // console.log(userEmail, updateData);
      const query = { email: userEmail };
      const updateDoc = {
        $set: { ...updateData },
      };
      const result = await usersCollection.updateOne(query, updateDoc);
      res.send(result);
    });

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

    // save a user data in db
    app.put("/user", async (req, res) => {
      const user = req.body;

      const query = { email: user?.email };
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

    //get contest by searching with tag in the banner section
    app.get("/api/contests", async (req, res) => {
      const { tag } = req.query;
      const result = await contestCollection
        .find({ category: { $regex: tag, $options: "i" } })
        .toArray();
      console.log(result);
      res.send(result);
    });

    // Fetch all contests
    app.get("/contests", verifyToken, verifyAdmin, async (req, res) => {
      const contests = await contestCollection.find({}).toArray();
      // console.log(contests);
      res.send(contests);
    });

    // Delete a contest
    app.delete("/contests/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await contestCollection.deleteOne(query);
      res.send(result);
    });

    // Confirm and publish a contest
    app.patch(
      "/contests/confirm/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
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
      }
    );

    // Add a comment to a contest
    app.post(
      "/contests/comment/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
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
      }
    );

    app.get("/contests/popular", async (req, res) => {
      const popularContests = await contestCollection
        .aggregate([
          {
            $addFields: {
              participantsCount: { $size: "$participants" },
            },
          },
          { $sort: { participantsCount: -1 } },
          { $limit: 5 },
        ])
        .toArray();

      res.send(popularContests);
    });

    // get all advertise data from  db
    app.get("/advertise", async (req, res) => {
      const result = await advertiseCollection.find().toArray();
      // console.log(result);
      res.send(result);
    });

    //get creators data from db
    app.get("/creators", async (req, res) => {
      try {
        const topCreators = await contestCollection
          .aggregate([
            {
              $match: {
                participants: { $exists: true, $not: { $type: "null" } },
              },
            },
            {
              $addFields: {
                participantsCount: {
                  $cond: {
                    if: { $isArray: "$participants" },
                    then: { $size: "$participants" },
                    else: 0,
                  },
                },
              },
            },
            {
              $group: {
                _id: "$creator.email",
                creatorName: { $first: "$creator.name" },
                creatorImage: { $first: "$creator.image" },
                totalParticipants: { $sum: "$participantsCount" },
                contests: {
                  $push: {
                    contestName: "$contestName",
                    contestDescription: "$description",
                    participantsCount: "$participantsCount",
                  },
                },
              },
            },
            { $sort: { totalParticipants: -1 } },
            { $limit: 3 },
          ])
          .toArray();

        res.send(topCreators);
      } catch (error) {
        console.error("Error fetching top creators:", error);
        res.status(500).send({ message: "Error fetching top creators", error });
      }
    });

    app.post("/contests", verifyToken, verifyCreator, async (req, res) => {
      const contestData = req.body;
      const userEmail = contestData?.creator?.email;
      const query = { email: userEmail };
      const user = await usersCollection.findOne(query);
      const isBlocked = user?.status === "Blocked";
      // console.log(isBlocked);
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
        // console.log(id);
        const contestData = req.body;
        const query = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: contestData,
        };
        const result = await contestCollection.updateOne(query, updateDoc);
        res.send(result);
      }
    );

    // Fetch all confirmed contests
    app.get("/all-contests", async (req, res) => {
      const contests = await contestCollection
        .find({ status: "confirmed" })
        .toArray();
      res.send(contests);
    });

    // Fetch contest details
    app.get("/contests/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ message: "Invalid ObjectId format" });
      }
      const query = { _id: new ObjectId(id) };
      const result = await contestCollection.findOne(query);

      res.send(result);
    });

    // payment intent
    app.post("/create-payment-intent", verifyToken, async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);
      // console.log(amount, "amount inside the intent");

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    app.post("/payments", verifyToken, async (req, res) => {
      const payment = req.body;
      const paymentResult = await paymentsCollection.insertOne(payment);
      // console.log("payment info", payment);
      res.send(paymentResult);
    });
    // Add a user to a contest
    app.post("/contests/register/:id", verifyToken, async (req, res) => {
      const contestId = req.params.id;
      const { userId, userName, userEmail } = req.body;
      const query = { _id: new ObjectId(contestId) };
      // console.log(query);
      const contest = await contestCollection.findOne(query);
      // console.log(contest);
      if (
        contest?.participants?.some(
          (participant) => participant.userId === userId
        )
      ) {
        return res
          .status(400)
          .send({ message: "User already registered for this contest" });
      }

      // Add participant
      const updateDoc = {
        $push: {
          participants: { userId, userName, userEmail },
        },
        $inc: {
          participantsCount: 1,
        },
      };

      const result = await contestCollection.updateOne(query, updateDoc);
      // console.log(result);
      res.send(result);
    });

    // get all contests created by a creator/user
    app.get("/contests/created-by/:email", verifyToken, async (req, res) => {
      const userEmail = req.params.email;
      // console.log(userEmail);
      const contests = await contestCollection
        .find({ "creator.email": userEmail })
        .toArray();
      // console.log(contests);
      res.send(contests);
    });

    // Get contests participated by a user
    app.get(
      "/contests/my-participated/:email",
      verifyToken,
      async (req, res) => {
        try {
          const userEmail = req.params.email;
          // console.log(userEmail);
          if (!userEmail) {
            return res.status(400).send({ message: "User email not provided" });
          }

          const contests = await contestCollection
            .find({
              "participants.userEmail": userEmail,
            })
            .toArray();
          // console.log(contests);

          res.send(contests);
        } catch (error) {
          console.error("Error fetching participated contests:", error);
          res.status(500).send({ message: "Server error" });
        }
      }
    );

    // Get all submissions for a specific contest
    app.get("/contests/:contestId/submissions", async (req, res) => {
      const contestId = req.params.contestId;
      // console.log(contestId);
      const contest = await contestCollection.findOne({
        _id: new ObjectId(contestId),
      });
      // console.log(contest);
      if (!contest) {
        return res.status(404).send({ message: "Contest not found" });
      }

      res.send(contest.participants || []);
    });

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
  console.log(`Contest Hub listening on port ${port}`);
});
