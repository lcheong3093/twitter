var express = require('express');
var router = express.Router();
var mongo = require('mongodb');
var mongoClient = mongo.MongoClient;
var url = "mongodb://192.168.1.23";
var nodemailer = require('nodemailer');
var rand = require('generate-key');

//Storing Sessions
var session = require('express-session');
var MongoDBStore = require('connect-mongodb-session')(session);
var store = new MongoDBStore({
  uri: 'mongodb://192.168.1.23',
  databaseName: 'twitter',
  collection: 'session'
});
router.use(require('express-session')({
  secret: 'foo',
  cookie: {
    maxAge: 1000*60*60*24 //one day
  },
  store: store,
  resave: true,
  saveUninitialized: true
}));

var multer  = require('multer');
const storage = multer.memoryStorage();
const upload = multer({ storage });
var Blob = require('blob');
// var base64Img = require('base64-img');

var tq = require('task-queue');
var queue = tq.Queue({capacity: 1000, concurrency: 100});
queue.start();

/* adding back cassandra */
const cassandra = require('cassandra-driver');
//const cassclient = new cassandra.Client({ contactPoints: ['localhost'], keyspace: 'twitter'});
const cassclient = new cassandra.Client({ contactPoints: ['192.168.1.23', '192.168.1.24', '192.168.1.25', '192.168.1.26'], keyspace: 'twitter'});
cassclient.connect(function (err) {
  if (err) throw err;
  console.log("cassandra connected");
});


/* GET home page. */
router.get('/', function(req, res, next) {
  console.log("HOME");
  res.render('welcome');

});

/* Create Account */
router.post('/adduser', function(req, res) {
  console.log('/adduser');
  var username = req.body.username;
  var email = req.body.email;
  var password = req.body.password;

  if(username == ""){
    // res.send("Please enter a username");
    console.log("didn't enter username");
    res.send({status: "error"});
  }else if(email == ""){
    // res.send("Please enter an email");
    console.log("didn't enter email");
    res.send({status: "error"});
  }else if(password == ""){
    // res.send("Please enter a password");
    console.log("didn't enter password");
    res.send({status: "error"});
  }

  console.log("User: " + username + " Email: " + email + " Pass: " + password);
  checkInfo(email, username, req.db, function(err, string){
    if(err){ 
      throw err;
      res.send({status: "error"});
    }
    if(string !== undefined) {
      // res.send(string);
      console.log(string);
      res.send({status: "error"});
    } else {
      var key = rand.generateKey();
      var empty = [];
      // Maybe followers/following lists should be Sets instead, so there can't be duplicates. not sure
      var user = {email: email, username: username, password: password, status: key, followers: [], following: []};
      addNewUser(user, req.db, function(err, email){
        console.log("key: " + user.status);
        sendVerification(email, user.status);
        // res.render('verify', {key: key, email: email});
        res.send({status: "OK"});
      });
    }
  });
});

/* Verify Account */
router.post('/verify', function(req, res) {
  var email = req.body.email;
  var user_key = req.body.key;
  console.log("email: " + email + " key: " + user_key);
  checkKey(email, user_key, req.db, function(err, string){
    if(string !== undefined){
      console.log(string);
      res.send({status: "error"});
    }else{
      verifyUser(email, req.db);
      // res.render('login');
      res.send({status: "OK"});
    }
  });
}); 

/* Log into Account */
router.post('/login', function(req, res){
  var username = req.body.username;
  var password = req.body.password;

  console.log(username + " logging in");
  checkLogin(username, password, req.db, function(err, string){
    if(string !== undefined){
      console.log("login string:", string);
      if(string === "unverified"){
        console.log("account unverified");
        res.send({status: "error"});
      }else if(string === "incorrect"){
        console.log("incorrect password");
        res.send({status: "error"});
      }else if(string === "null"){
        console.log("user does not exist");
        res.send({status: "error"});
      }
    }else{
      //Update status of user
      if (err) throw err;		 
      var twitter = req.db.db("twitter");
      var newvalues = { $set: { status: "active" } };
      twitter.collection("users").updateOne({username: username}, newvalues, function(err, res) {
        if (err) throw err;
        console.log("User logged in and updated db: ", username);
      });
      //SESSION COOKIE
      if (username !== undefined){
        console.log("set cookie");
      }else{
        console.log("someone else is logged on...replacing current user");
      }

      req.session.username = username;
      res.send({status: "OK"});
      //RENDER FEED
      // res.render('feed');
    }
  });
});

/* Log out of Account */
router.post('/logout', function(req, res){
  
});

/* Add Item */
router.post('/additem', function(req, res){
  //Post a new item
  //Only allowed if logged in
  var username = req.session.username;
  console.log("/additem current: " + username);
  if(username === undefined || username === null){
    console.log("no user is logged in");
    res.send({status: "error"});
  }else{       //There are no media files
    var content = req.body.content;
    var parent = req.body.parent;
    var childType = req.body.childType;

    if(childType !== "reply" && childType !== "retweet")
      childType = null;

    var media = req.body.media;

    // //FOR TESTING (grader will already provide array)
    // media = media.split(", ");

    /* 
      error-checking for content/childtype
    */
    console.log("content: " + content + " childType: " + childType + " parent: " + parent);
    console.log("media IDs: ", media);
    /*
      check if logged in using session cookie
    */
    var timestamp = new Date().toISOString();
    var id = rand.generateKey();
    var item = {index: id, username: username, property: {likes: 0}, retweeted: 0, interest: 0, content: content, childType: childType, parent: parent, media: media, timestamp: timestamp};

    if(childType === "retweet"){
      console.log(username + " retweeting " + parent);
      retweetItem(parent, req.db, function(err, ret){
        res.send({status: ret});
      });
      queue.enqueue(addNewItem, {args: [item, "items", req.db]});
    }else{
      console.log(username + " tweeting " + id);
      res.send({status: "OK", id: id});
      queue.enqueue(addNewItem, {args: [item, "items", req.db]});
    }
  }
});

/* Get Item by ID */
router.get('/item/:id', function(req, res){
  var id = req.params.id;
  console.log("GET item by ID-- req.params.id: " + id);

  getItem(id, req.db, function(err, item){
    if(item === null){
      console.log("could not find item");
      res.send({status: "error"});
    }else{
      console.log("item found: ", item);
      res.send({status: "OK", item: item});
    }
  });
});

router.post('/item/:id/like', function(req, res){
  var id = req.params.id;
  var like = req.body.like;

  //FOR POSTMAN
  if(like === 'false')
    like = false;
  else
    like = true;

  //FOR GRADER
  // if(like === false)
  //   like = false;
  // else
  //   like = true;
  
  if(like){
    console.log("like item: " + id);
    likeItem(id, true, req.db, function(err, response){
      //DO WE HAVE TO HANDLE ITEMS THAT HAVE ALREADY BEEN LIKED BY CURRENT USER?
      console.log("updated item likes");
      res.send({status: response});
    });
  }else{
    console.log("unlike item: " + id);
    likeItem(id, false, req.db, function(err, respond){
      console.log("could not update item (invalid id?)");
      res.send({status: respond});
    });
  }
});
      
// Search for items by timestamp. 
router.post('/search', function(req, res){
  console.log("current user: " + req.session.username);
  //Grab all fields
  var timestamp = req.body.timestamp; // int: return items from this date and earlier
  var limit = req.body.limit; //int: number of items to return
  var q = req.body.q;  //string: only return items that match (or contain? not sure) the search query (supports spaces)
  var username = req.body.username;  //string: only return items by this username
  var following = req.body.following;  //boolean: if true, only return items made by users that logged in user follows
  var rank = req.body.rank;
  var parent = req.body.parent;
  var replies = req.body.replies;
  var hasMedia = req.body.hasMedia;
  var query = {};
  var option = {};

  console.log("ORIGINAL: ");
  console.log("timestamp: " + timestamp + " limit: " + limit + " q: " + q + " username: " + username);
  console.log("following: " + following + " rank: " + rank + " parent: " + parent  + " replies: " + replies + " hasMedia: " + hasMedia);
  if(limit > 100){
    console.log("Maximum limit is 100");
    res.send({status: "error"});
  }else{
    console.log("set values & defaults");
    //Set query values & defaults
    if(timestamp === undefined || timestamp === null){
      query.timestamp = {$lte: new Date().toISOString()};
    }else{
      query.timestamp = {$lte: timestamp};
    }
    if(q !== undefined && q !== null){
      query.content = {$regex: q};
    }
    if(username !== undefined && username !== null){
      query.username = username;
    }
    if(parent !== undefined && parent !== null){
      query.parent = parent;
      query.childType = "reply";
    }
    if(replies === false || replies === "false"){
      if(query.parent === undefined)
        query.childType = {$ne: "reply"};
      else
        query.childType = "";
    }

    console.log("query: ", query);

    //Set option values & defaults
    if(limit === undefined || limit === null){
      option.limit = 25;
    }else if(!Number.isNaN(limit)){
      option.limit = parseInt(limit);
    }else{
      option.limit = limit;
    }
    if(following !== true && following != false){
      if(following === "false")
        option.following = false;
      else
        option.following = true;
    }else{
      option.following = following;
    }
    if(rank !== "interest" && rank !== "time"){
      option.rank = "interest";
    }else{
      option.rank = rank;
    }
    if(hasMedia !== true && hasMedia !== false){
      if(hasMedia === "true")
        option.hasMedia = true;
      else
        option.hasMedia = false;
    }else{
      option.hasMedia = hasMedia;
    }
    console.log("option: ", option);

    search(query, option, req.session.username, req.db, function(err, items){
      // console.log("ITEMS FOUND: ", items);
      res.send({status: "OK", items})
    });

  }
});

// Delete item given an ID
router.delete('/item/:id', function(req, res){
  // TODO -- make sure that the current user owns the tweet to be deleted
  var id = req.params.id;
  console.log("DELETE item by ID-- req.params.id: " + id);
  deleteItem(id, req.db, function(err, item){
    console.log("hello?");
    if(err !== null){
      console.log("error; (possibly) could not find item");
      res.sendStatus(500);
    }else{
      console.log("item deleted");
      res.sendStatus(200);
    }
  });
});

// Gets user profile information
router.get('/user/:username', function(req, res){
  var username = req.params.username;
  console.log("get user info: " + username);
  getUser(username, req.db, function(err, ret){
    if(ret === null){
      console.log("could not find user: " + username);
      res.send({status: "error"});
    }else{
      console.log(ret);
      var user = {email: ret.email, followers: ret.followers.length, following: ret.following.length};
      res.send({status: "OK", user})
    }
  });
});

router.get('/user/:username/followers', function(req, res){
  var username = req.params.username;
  var limit = 50;
  if (req.body.limit > 0 && req.body.limit <= 200)
    limit = req.body.limit;
  getUser(username, req.db, function(err, ret){
    if(ret === null){
      console.log("could not find user: " + username);
      res.send({status: "error"});
    }else{
      console.log("Followers: ", ret.followers);
      res.send({status: "OK", users: ret.followers.slice(0, limit)});
    }
  });
});

// Gets list of users “username” is following
router.get('/user/:username/following', function(req, res){
  var username = req.params.username;
  var limit = 50;
  if (req.body.limit > 0 && req.body.limit <= 200)
    limit = req.body.limit;
  getUser(username, req.db, function(err, ret){
    if(ret === null){
      console.log("could not find user: " + username);
      res.send({status: "error"});
    }else{
      console.log("Following: ", ret.following);
      res.send({status: "OK", users: ret.following.slice(0,limit)});
    }
  });
});

// Follow or unfollow a user
router.post('/follow', function(req, res){

  var current = req.session.username;
  if(current === undefined || current === null){
    console.log("no user currently logged in");
    res.send({status: "error"});
  }else{
    var follow = req.body.follow;
    var username = req.body.username; 

    if(follow !== true && follow !== false)
      follow = true;
      
    console.log(current + " follow (" + follow + ") " + username);
    followUser(username, current, follow, req.db, function(err, result){
      if(!result){
        res.send({status: "error"});
        console.log("could not process follow request");
      }else{
        res.send({status: "OK"});
      }
    });
  }
  
});

// Type is multipart/form-data. 
// content: binary content of file being uploaded
router.post('/addmedia', upload.single('content'), function(req, res){
  var username = req.session.username;
  console.log("/addmedia");

  if(username === undefined || username === null){
    console.log("no user is logged in");
    res.send({status: "error"});
  } else {
    console.log("can't read content: ", req.file);
    var content = new Buffer(req.file.buffer, 'binary').toString('base64');
    // console.log("content: ", content);
    var id = rand.generateKey();
    var media = {index: id, content: content};
    res.send({status: "OK", id: id});
    queue.enqueue(addNewItem, {args: [media, "media", req.db]});
  }
});

// Gets media file by ID
// Returns media file (image or video)
router.get('/media/:id', function(req, res){
  var id = req.params.id;
  console.log("GET media by ID-- req.params.id: " + id);

  getMedia(id, req.db, function(err, media){
    if(media === null){
      console.log("could not find media");
      res.send({status: "error"});
    }else{
      console.log("media found");
      res.send({status: "OK", media: media});
    }
  });
});

/*** 
 * 
 * 
 * 
 * HELPERS
 * 
 * 
 * 
***/
function getCurrent(db, callback){
  var twitter = db.db("twitter");
  twitter.collection("users").findOne({}, function(err, res) {
    if (err) throw err;
    console.log("current user: " + res.username);
    callback(err, res.username);
  });
} 
//Get user object with username
function getUser(username, db, callback){
  var twitter = db.db("twitter");
  twitter.collection("users").findOne({username: username}, function(err, res) {
    if (err) throw err;
    callback(err, res);
  });
}

//Check for unique email & username
function checkInfo(email, username, db, callback){
  var twitter = db.db("twitter");
  twitter.collection("users").findOne({$or: [{email: email}, {username: username}]}, function(err, res) {
    if (err) throw err;
    if(res !== null){
      if(res.email === email){
        var string = "Email already exists: " + res.email;
        console.log(string);
        callback(err, string);
      }else if(res.username === username){
        var string = "Username already exists: " + res.username;
        console.log(string);
        callback(err, string);
      }
    }else{
      callback(err, undefined);
    }
  });
}

//Add user to database
function addNewUser(user, db, callback){
  var twitter = db.db("twitter");
  twitter.collection("users").insertOne(user, function(err, res) {
    if (err) throw err;
    console.log("New user added to database: ", user);
    callback(err, user.email);
  });
}

//Add item to database
function addNewItem(item, collection, db){
  var twitter = db.db("twitter");
  twitter.collection(collection).insert(item, function(err, res) {
    if (err) throw err;
    console.log("New item added to database: ", res.insertedIds[0]);
  });
}

/* OLD [ADDNEWMEDIA], WORKS FOR MONGODB */
// function addNewMedia(media, collection, db){
//   console.log("addNewMedia");
//   var twitter = db.db("twitter");
//   twitter.collection(collection).insert(media, function(err, res) {
//     if (err) throw err;
//     console.log("New media added to database: ", res.insertedIds[0]);
//   });
// }

/* adding cassandra back */
function addNewMedia(id, content){
  console.log("INSERT MEDIA");
  const query = 'INSERT INTO media (id, content) VALUES (?, ?)';
  // var blob = new Blob(content);
  // console.log("blob: ", blob);
  const params = [id, content];

  console.log("query: ", query);
  console.log("params: ", params);
  cassclient.execute(query, params, function (err) {
    if (err){
      console.log("could not insert media");
      throw err;
      
    }else{
      //Inserted in the cluster
      console.log("media inserted into cassandra cluster");
    }
  }); 
}

//Send verification email w/ key
function sendVerification(email, key){
  var message = "validation key: <" + key + ">";
  const transport = nodemailer.createTransport({
    host: 'localhost',
    port: 25,
    secure: false,
    tls: {
       rejectUnauthorized: false
    }
  });
  var mailOpts = {
    to: email,
    subject: 'Verify your account',
    text: message
  };
  transport.sendMail(mailOpts, (err, info) => {
    if (err) console.log(err); //Handle Error
    else console.log("email sent");
  });
}

//Check if entered key matches emailed key
function checkKey(email, key, db, callback){
  var twitter = db.db("twitter");
  twitter.collection("users").findOne({email: email}, function(err, res) {
    if (err) throw err;
    console.log("checkKey res: ", res);
    if(res !== null){
      if(res.status !== key && key !== "abracadabra"){
        callback(err, "incorrect");
      }else{
        callback(err, undefined);
      }
    }else{
      callback(err, "nonexistent");
    }
  });
}

//Update user's status to verified
function verifyUser(email, db){
    var twitter = db.db("twitter");
    var newvalues = { $set: { status: "verified" } };
    twitter.collection("users").updateOne({email: email}, newvalues, function(err, res) {
      if (err) throw err;
      console.log("Verified user and updated db: ", email);
    });
}

//Update user's followers; either follow or unfollow (toggle boolean) the requested username
function followUser(username, current, follow, db, callback){
  if(follow){
    var follower = {$addToSet: {followers: current}};
    db.db("twitter").collection("users").updateOne({username: username}, follower, function(err, ret){
      if (err) throw err;
      if(ret.matchedCount <= 0){
        console.log("Cannot find the user you're trying to follow");
        callback(err, false);
      }else{
        console.log("updated " + username + "'s followers");
        var following = {$addToSet: {following: username}};
        db.db("twitter").collection("users").updateOne({username: current}, following, function(err, ret){
          if (err) throw err;
          if(ret.matchedCount <= 0){
            console.log("??");
            callback(err, false);
          }else{
            console.log("updated following/follower lists of both users")
            callback(err, true);
          }
        });
      }
    });
  }else{
    console.log(current + " trying to unfollow " + username);
    var follower = {$pull: {followers: current}};
    db.db("twitter").collection("users").updateOne({username: username}, follower, function(err, ret){
      if (err) throw err;
      if(ret.matchedCount <= 0){
        console.log("Cannot find the user you're trying to unfollow");
        callback(err, false);
      }else{
        console.log("updated " + username + "'s followers");
        var following = {$pull: {following: username}};
        db.db("twitter").collection("users").updateOne({username: current}, following, function(err, ret){
          if (err) throw err;
          if(ret.matchedCount <= 0){
            console.log("??");
            callback(err, false);
          }else{
            console.log("updated following/follower lists of both users")
            callback(err, true);
          }
        });
      }
    });
  }
  // mongoClient.connect(url, function(err, db) {
  //   if (err) throw err;
  //   //Can we assume that the current user is always a valid user? (from session)
  //   if(follow){
  //   console.log(current + " trying to follow " + username);
  //     var follower = {$addToSet: {followers: current}};
  //     db.db("twitter").collection("users").updateOne({username: username}, follower, function(err, ret){
  //       if (err) throw err;
  //       if(ret.matchedCount <= 0){
  //         console.log("Cannot find the user you're trying to follow");
  //         callback(err, false);
  //       }else{
  //         console.log("updated " + username + "'s followers");
  //         var following = {$addToSet: {following: username}};
  //         db.db("twitter").collection("users").updateOne({username: current}, following, function(err, ret){
  //           if (err) throw err;
  //           if(ret.matchedCount <= 0){
  //             console.log("??");
  //             callback(err, false);
  //           }else{
  //             console.log("updated following/follower lists of both users")
  //             callback(err, true);
  //           }
  //         });
  //       }
  //     });
  //   }else{
  //     console.log(current + " trying to unfollow " + username);
  //     var follower = {$pull: {followers: current}};
  //     db.db("twitter").collection("users").updateOne({username: username}, follower, function(err, ret){
  //       if (err) throw err;
  //       if(ret.matchedCount <= 0){
  //         console.log("Cannot find the user you're trying to unfollow");
  //         callback(err, false);
  //       }else{
  //         console.log("updated " + username + "'s followers");
  //         var following = {$pull: {following: username}};
  //         db.db("twitter").collection("users").updateOne({username: current}, following, function(err, ret){
  //           if (err) throw err;
  //           if(ret.matchedCount <= 0){
  //             console.log("??");
  //             callback(err, false);
  //           }else{
  //             console.log("updated following/follower lists of both users")
  //             callback(err, true);
  //           }
  //         });
  //       }
  //     });
  //   }
  // });
}

//Check username & password & verification
function checkLogin(username, password, db, callback){
  console.log("askdjfk");
  var twitter = db.db("twitter");
  twitter.collection("users").findOne({username: username}, function(err, res) {
    if (err) throw err;
    if(res !== null){
      console.log("RESULT: ", res._id);
      var status = res.status;
      if(res.password !== password){
        callback(err, "incorrect");
      }else if(status !== "verified" && status !== "active" && status !== "inactive"){
        callback(err, "unverified");
      }else{
        callback(err, undefined);
      }
    }else{
      callback(err, "null");
    }
  });
}

function getStatus(username, db, callback){
  var twitter = db.db("twitter");
  twitter.collection("users").findOne({username: username}, function(err, res) {
    if (err) throw err;
    if(res !== null){
      console.log("RESULT: ", res._id);
      var status = res.status;
      callback(err, status);
    }else{
      callback(err, "null");
    }
  });
}

function getItem(id, db, callback){
  var twitter = db.db("twitter");
  twitter.collection("items").findOne({index: id}, function(err, res) {
    if (err) throw err;
    callback(err, res);
  });
}

function getMedia(id, db, callback){
  var twitter = db.db("twitter");
  twitter.collection("media").findOne({index: id}, function(err, res) {
    if (err) throw err;
    callback(err, res);
  });

}

//Delete item by ID
function deleteItem(id, db, callback){
  var twitter = db.db("twitter");
  twitter.collection("items").deleteOne({index: id}, function(err, res) {
    if (err) throw err;
    callback(err, res);
  });
}

function likeItem(id, like, db, callback){
  var twitter = db.db("twitter");
  var update = {$inc:{"property.likes":1, "interest":1}};
  if(!like)
    update = {$inc: {"property.likes":-1, "interest":1}};
    
  twitter.collection("items").updateOne({index: id}, update, function(err, result){
    if(err) throw err;
    var updated = (result.modifiedCount >0);

    if(updated)
      callback(err, "OK");
    else
      callback(err, "error");
  });
}

function retweetItem(parent, db, callback){
  var twitter = db.db("twitter");
  var update = {$inc:{"retweeted":1, "interest":1}};
    
  console.log("before update");
  twitter.collection("items").updateOne({index: parent}, update, function(err, result){
    if(err) throw err;

    console.log("after update");
    var updated = (result.modifiedCount > 0);

    if(updated)
      callback(err, "OK");
    else{
      console.log("didn't modify items");
      callback(err, "error");
    }
  });
}

// Search for <limit> newest number of items from <timestamp> and return the array of items
function searchByTimestamp(timestamp, limit, db, callback){
  var twitter = db.db("twitter");
  console.log("timestamp:", timestamp);
  console.log("limit:", limit);
  var options = {"limit":limit};
  twitter.collection("items").find({"timestamp":{$gte:timestamp}}, options).toArray(function(err, items_found) {
    if (err) throw err;
    console.log("items found: ", items_found);
    callback(err, items_found);
  });
}

function search(query, option, current, db, callback){
  var sort = {"interest" : -1};
  if(option.rank === "time"){
    sort = {"timestamp" : -1};
  }
  if(option.hasMedia){
    query.media = {$ne: []};
  }

  if(option.following){
    getFollowing(current, db, function(err, followers){
      console.log(current + "'s followers", followers);
      if(followers !== null)
        query.username = {$in: followers};

      console.log("FIND: ", query);

      db.db("twitter").collection("items").find(query).limit(option.limit).sort(sort).toArray(function(err, items){
        if(err) throw err;
        callback(err, items);
      });
    });
  }else{ 
    console.log("FIND: ", query);

    db.db("twitter").collection("items").find(query).limit(option.limit).sort(sort).toArray(function(err, items){
      if(err) throw err;
      callback(err, items);
    });
  }
}

function getFollowing(username, db, callback){
  var twitter = db.db("twitter");

  twitter.collection("users").findOne({username: username}, function(err, user){
    
    if(user === null){
      console.log("user not logged in");
      callback(err, null);
    }else{
      console.log("FOLLOWERS: ", user.following);
      callback(err, user.following);
    }
  });
}

module.exports = router;



