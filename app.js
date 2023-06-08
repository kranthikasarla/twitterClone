const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const dbPath = path.join(__dirname, "twitterClone.db");
const app = express();
app.use(express.json());

let db = null;
const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error:${e.message}`);
    process.exit(1);
  }
};
initializeDbAndServer();

const authenticateToken = (request, response, next) => {
  const { tweet } = request.body;
  const { tweetId } = request.params;
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.payload = payload;
        request.tweetId = tweetId;
        request.tweet = tweet;
        next();
      }
    });
  }
};

app.post("/register", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  console.log(username, password, name, gender);
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);
      const createUserQuery = `
            INSERT INTO 
            user(name, username, password, gender)
            VALUES
            ('${name}',
            '${username}',
            '${hashedPassword}',
            '${gender}')
            ;`;

      await db.run(createUserQuery);
      response.status(200);
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

app.post("/login", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  console.log(username, password);
  const dbUser = await db.get(selectUserQuery);
  console.log(dbUser);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatch = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatch === true) {
      const jwtToken = jwt.sign(dbUser, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

app.get("/user/tweets/feed", authenticateToken, async (request, response) => {
  const { payload } = request;
  const { user_id, name, username, gender } = payload;
  console.log(name);
  const getTweetsFeedQuery = `
    SELECT username, tweet, date_time AS dateTime
    FROM 
    follower INNER JOIN tweet ON follower.following_user_id = tweet.user_id INNER JOIN user ON user.user_id = follower.following_user_id
    WHERE 
    follower.follower_user_id = ${user_id}
    ORDER BY 
    date_time DESC
    LIMIT 4;`;
  const tweetFeedArray = await db.all(getTweetsFeedQuery);
  response.send(tweetFeedArray);
});

app.get("/user/following", authenticateToken, async (request, response) => {
  const { payload } = request;
  const { user_id, name, username, gender } = payload;
  console.log(name);
  const userFollowsQuery = `
    SELECT 
    name
    FROM
    user INNER JOIN follower ON user.user_id = follower.following_user_id
    WHERE 
    follower.follower_user_id = ${user_id};`;
  const userFollowerArray = await db.all(userFollowsQuery);
  response.send(userFollowerArray);
});

app.get("/user/followers", authenticateToken, async (request, response) => {
  const { payload } = request;
  const { user_id, name, username, gender } = payload;
  console.log(name);
  const userFollowerQuery = `
    SELECT 
    name
    FROM 
    user INNER JOIN follower ON user.user_id = follower.follower_user_id
    WHERE
    follower.following_user_id = ${user_id};`;
  const userFollowerArray = await db.all(userFollowerQuery);
  response.send(userFollowerArray);
});

app.get("/tweets/:tweetId", authenticateToken, async (request, response) => {
  const { tweetId } = request;
  const { payload } = request;
  const { user_id, name, username, gender } = payload;
  console.log(name, tweetId);
  const tweetsQuery = `SELECT * FROM tweet WHERE tweet_id = ${tweetId};`;
  const tweetsResult = await db.get(tweetsQuery);

  const userFollowerQuery = `
    SELECT * FROM 
    follower INNER JOIN user ON user.user_id = follower.following_user_id
    WHERE 
    follower.follower_user_id = ${user_id};`;
  const userFollowers = await db.all(userFollowerQuery);
  if (
    userFollowers.some(
      (item) => item.following_user_id === tweetsResult.user_id
    )
  ) {
    console.log(tweetsResult);
    console.log("-----------");
    console.log(userFollowers);
    const getTweetDetailsQuery = `
    SELECT 
        tweet,
        COUNT(DISTINCT(like.like_id)) AS likes,
        COUNT(DISTINCT(reply.reply_id)) AS replies,
        tweet.date_time AS dateTime
        FROM 
        tweet INNER JOIN like ON tweet.tweet_id = like.tweet_id INNER JOIN reply ON reply.tweet_id = tweet.tweet_id
        WHERE 
        tweet.tweet_id = ${tweetId} AND tweet.user_id = ${userFollowers[0].user_id};`;
    const tweetDetails = await db.get(getTweetDetailsQuery);
    response.send(tweetDetails);
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

app.get(
  "/tweets/:tweetId/likes",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request;
    const { payload } = request;
    const { user_id, name, username, gender } = payload;
    console.log(name, tweetId);
    const getLikesUserQuery = `
    SELECT * 
    FROM 
    follower INNER JOIN tweet ON tweet.user_id = follower.following_user_id INNER JOIN like ON like.tweet_id = tweet.tweet_id 
    INNER JOIN user ON user.user_id = like.user_id
    WHERE 
    tweet.tweet_id = ${tweetId} AND follower.follower_user_id = ${user_id};`;

    const likedUser = await db.all(getLikesUserQuery);
    console.log(likedUser);
    if (likedUser.length !== 0) {
      let likes = [];
      const getNamesArray = (likedUser) => {
        for (let item of likedUser) {
          likes.push(item.username);
        }
      };
      getNamesArray(likedUser);
      response.send({ likes });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

app.get(
  "/tweets/:tweetId/replies",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request;
    const { payload } = request;
    const { user_id, name, username, gender } = payload;
    console.log(name.tweetId);
    const getRepliesUserQuery = `
    SELECT * FROM 
    follower INNER JOIN tweet ON tweet.user_id = follower.following_user_id INNER JOIN reply ON reply.tweet_id = tweet.tweet_id 
    INNER JOIN user ON user.user_id = reply.user_id
    WHERE 
    tweet.tweet_id = ${tweetId} AND follower.follower_user_id = ${user_id};`;
    const repliedUser = await db.all(getRepliesUserQuery);
    console.log(repliedUser);
    if (repliedUser.length !== 0) {
      let replies = [];
      const getNamesArray = (repliedUser) => {
        for (let item of repliedUser) {
          let object = {
            name: item.name,
            reply: item.reply,
          };
          replies.push(object);
        }
      };
      getNamesArray(repliedUser);
      response.send({ replies });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

app.get("/user/tweets", authenticateToken, async (request, response) => {
  const { payload } = request;
  const { user_id, name, username, gender } = payload;
  console.log(name, user_id);
  const getTweetsDetailsQuery = `SELECT 
    tweet.tweet AS tweet,
    COUNT(DISTINCT(like.like_id)) AS likes,
    COUNT(DISTINCT(reply.reply_id)) AS replies,
    tweet.date_time AS dateTime
    FROM 
    user INNER JOIN tweet ON user.user_id = tweet.user_id INNER JOIN like ON like.tweet_id = tweet.tweet_id INNER JOIN reply ON reply.tweet_id = tweet.tweet_id
    WHERE 
    user.user_id = ${user_id}
    GROUP BY 
    tweet.tweet_id;`;
  const tweetsDetails = await db.all(getTweetsDetailsQuery);
  response.send(tweetsDetails);
});

app.post("/user/tweets", authenticateToken, async (request, response) => {
  const { tweet } = request;
  const { tweetId } = request;
  const { payload } = request;
  const { user_id, name, username, gender } = payload;
  console.log(name, tweetId);
  const postTweetQuery = `INSERT INTO 
    tweet(tweet, user_id)
    VALUES
    (
        '${tweet}',
        ${user_id}
    );`;

  await db.run(postTweetQuery);
  response.send("Created a Tweet");
});

app.delete("/tweets/:tweetId", authenticateToken, async (request, response) => {
  const { tweetId } = request;
  const { payload } = request;
  const { user_id, name, username, gender } = payload;
  const selectUserQuery = `SELECT * FROM tweet WHERE tweet.user_id = ${user_id} AND tweet.tweet_id = ${tweetId};`;
  const tweetUser = await db.all(selectUserQuery);
  if (tweetUser.length !== 0) {
    const deleteTweetQuery = `
        DELETE FROM tweet
        WHERE
        tweet.user_id = ${user_id} AND tweet.tweet_id = ${tweetId};`;
    await db.run(deleteTweetQuery);
    response.send("Tweet Removed");
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

module.exports = app;
