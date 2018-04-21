var express = require('express');
var router = express.Router();
var mongo = require('mongodb');
var mongoClient = mongo.MongoClient;
var url = "mongodb://localhost";

var nodemailer = require('nodemailer');
var rand = require('generate-key');
var session = require('express-session');
router.use(session({
  secret: 'foo',  
  resave: false,
  saveUninitialized: false
}));

var multer  = require('multer');
var upload = multer({ dest: 'uploads/' }); 

var tq = require('task-queue');
var queue = tq.Queue({capacity: 1000, concurrency: 100});
queue.start();

var count = 0;

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('welcome');

});

/* Create Account */
router.post('/adduser', function(req, res) {
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
        res.render('verify', {key: key, email: email});
        // res.send({status: "OK"});
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
      res.render('login');
      // res.send({status: "OK"});
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
      // res.send({status: "OK"});
      //RENDER FEED
      res.render('feed');
    }
  });
});

/* Log out of Account */
router.post('/logout', function(req, res){
  console.log("current user " + req.session.username);
  //if user is not logged in, return status: "error"
  if(req.session.username === null){
    console.log("No current users");
    res.send({status: "error"});
  }else{
    req.session.username = null;
    res.send({status: "OK"});
  }
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

    //FOR TESTING (grader will already provide array)
    media = media.split(", ");

    
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
    var item = {index: id, username: username, property: {likes: 0}, retweeted: 0, content: content, childType: childType, parent: parent, media: media, timestamp: timestamp};

    if(childType === "retweet"){
      console.log(username + " retweeting " + parent);
      retweetItem(parent, req.db, function(err, ret){
        res.send({status: ret});
      });
      queue.enqueue(addNewItem, {args: [item, "items", req.db]});
    }else if(childType === "reply"){
      console.log(username + " replying to " + parent);
      res.send({status: "OK", id: id});
      queue.enqueue(addNewItem, {args: [item, "items", req.db]});
      queue.enqueue(addNewItem, {args: [item, "replies", req.db]});
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
  var status = "OK";
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

  // var query = {}; // https:// stackoverflow. com/questions/45307491/mongoose-complex-queries-with-optional-parameters
  // var defaults = {timestamp: timestamp, limit: limit, q: q, username: username, following: following};
  
  if(limit > 100){
    console.log("Maximum limit is 100");
    res.send({status: "error"});
  }else{
    //Set query parameters & defaults
    if(limit === undefined || limit === null){
      limit = 25;
    }
    if(timestamp === undefined || timestamp === null){
      timestamp = new Date().toISOString();
    }
    if(following !== true && following != false){
      following = true;
    }
    if(rank !== "interest" && rank !== "time"){
      rank = "interest";
    }
    if(replies !== true && replies !== false){
      replies = true;
    }
    if(hasMedia !== true && hasMedia !== false){
      hasMedia = false;
    }

    var query = {timestamp: timestamp, q: q, username: username, following: following, rank: rank, parent: parent, replies: replies, hasMedia: hasMedia};
    console.log("query: ", query);

    search(query, limit, req.db, function(err, result){

    });

  }
  
  // if(req.body.limit > 100){
  //   res.send({status: "error", error: "Max limit is 100"});
  // }else{
  //   for(var field in req.body){
  //     if(req.body[field] !== "" && field !== "limit" && field !== "following"){ //Add given queries into query
  //       if(field === "timestamp"){
  //         query[field] = {$lte: field};
  //       }else{
  //         query[field] = req.body[field];
  //       }
  //     }else{
  //       if(field === "timestamp"){
  //         query[field] = {$lte: timestamp};
  //       }
  //     }
  //   }

  //   if(Number.isNaN(req.body.limit)){
  //     limit = 25;
  //   }

  //   if(following !== true && following !== false){
  //     following = true;
  //   }

  //   if(req.body.following === "false")
  //     following = false;

  //   if(rank !== "time" && rank !== "interest")
  //     rank = "interest";

  //   console.log("search: ", query);
    
  //   search(query, limit, following, rank, req.session.username, req.db, function(err, items){
  //     res.send({status: "OK", items: items}); // items is an array of item objects
  //     // res.send({status:"error"});
  //   });
  // }
  
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
  //res.status(200).send();
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
  var current = req.session.username;  //User currently logged in
  var username = req.body.username;   //Username to follow
  var follow = req.body.follow;       //true = follow; false = unfollow

  console.log("follow: " + follow);
  console.log("user " + current + " follow: " + follow + " " + username);
  
  followUser(username, current, follow, function(err, ret){
    if(ret === false){
      res.send({status: "error"});
    }else{
      res.send({status: "OK"});
    }
  });
});

// Type is multipart/form-data. 
// content: binary content of file being uploaded

/* replace this with media*/
/* Add Item */
router.post('/addmedia', function(req, res){
  //Post a new item
  //Only allowed if logged in

  // var username = req.session.username;
  // if(username === undefined || username === null){
  //   console.log("no user is logged in");
  //   res.send({status: "error"});
  // }else{
  //   var content = req.body.content;
  //   var childType = req.body.childType;
  //   /* 
  //     error-checking for content/childtype
  //   */
  //   console.log("content: " + content + " childType: " + childType);
  //   /*
  //     check if logged in using session cookie
  //   */
  //   var timestamp = new Date().toISOString();
  //   var id = rand.generateKey();
  //   var item = {index: id, username: username, property: {likes: 0}, retweeted: 0, content: content, timestamp: timestamp};
  //   res.send({status: "OK", id: id});

  //   queue.enqueue(addNewItem, {args: [item, req.db]});
  // }

  var id = rand.generateKey();
  res.send({status: "OK", id: id});
});

// Gets media file by ID
// Returns media file (image or video)

/* replace getItem with getMedia*/
router.get('/media/:id', function(req, res){
  var id = req.params.id;
  console.log("GET media by ID-- req.params.id: " + id);

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

/*** 
 * 
 * 
 * 
 * HELPERS
 * 
 * 
 * 
***/

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
    // callback(err, res.insertedIds[0]);
  });
}

//Send verification email w/ key
function sendVerification(email, key){
  var message = "validation key: <" + key + ">";
  const transport = nodemailer.createTransport({
		host: 'smtp.gmail.com',
		port: 465,
		secure: true,
		auth: {
		  user: 'tttcse356@gmail.com',
		  pass: '2COMESafter1'
		}
  });
  var mailOpts = {
        from: 'user@gmail.com',
        to: email,
        subject: 'Verify your account',
        text: message
  };
  transport.sendMail(mailOpts, (err, info) => {
		if (err) console.log(err); //Handle Error
		console.log(info);
  });
}

//Check if entered key matches emailed key
function checkKey(email, key, db, callback){
  var twitter = db.db("twitter");
  twitter.collection("users").findOne({email: email}, function(err, res) {
    if (err) throw err;
    console.log("checkKey res: ", res);
    if(res !== null){
      if(res.status !== key){
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
function followUser(username, current, follow, callback){
  mongoClient.connect(url, function(err, db) {
    if (err) throw err;
    //Can we assume that the current user is always a valid user? (from session)
    if(follow){
    console.log(current + " trying to follow " + username);
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
  });
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
  var update = {$inc:{"property.likes":1}};
  if(!like)
    update = {$inc: {"property.likes":-1}};
    
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
  var update = {$inc:{"retweeted":1}};
    
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

function search(query, limit, db, callback){
  
}

function getFollowers(username, db, callback){
  var twitter = db.db("twitter");

  twitter.collection("users").findOne({username: username}, function(err, user){
    
    if(users === null){
      console.log("user not logged in");
      callback(err, null);
    }else{
      console.log("FOLLOWERS: ", user.followers);
      callback(err, user.followers);
    }
  });
}

module.exports = router;
