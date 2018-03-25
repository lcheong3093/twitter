var express = require('express');
var router = express.Router();
var mongo = require('mongodb');
var mongoClient = mongo.MongoClient;
var url = "mongodb://localhost"
var nodemailer = require('nodemailer');
var rand = require('generate-key');
var session = require('express-session')

router.use(session({
  secret: 'foo',  
  resave: false,
  saveUninitialized: false
}));

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
    res.send({status: "error"});
  }else if(email == ""){
    // res.send("Please enter an email");
    res.send({status: "error"});
  }else if(password == ""){
    // res.send("Please enter a password");
    res.send({status: "error"});
  }
  console.log("User: " + username + " Email: " + email + " Pass: " + password);
  checkInfo(email, username, function(err, string){
    if(err){ 
      throw err;
      res.send({status: "error"});
    }
    if(string !== undefined) {
      // res.send(string);
      res.send({status: "error"});
    } else {
      var key = rand.generateKey();
      var user = {email: email, username: username, password: password, status: key};
      addNewUser(user, function(err, email){
        console.log("key: " + user.status);
        sendVerification(email, user.status);
        // res.render('verify', {key: key, username: username});
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

  checkKey(email, user_key, function(err, string){
    if(string !== undefined){
      res.send({status: "error"});
    }else{
      verifyUser(email);
      res.send({status: "OK"});
    }
  });
}); 

/* Log into Account */
router.post('/login', function(req, res){
  var username = req.body.username;
  var password = req.body.password;

  checkLogin(username, password, function(err, string){
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
      // res.send(string);
    }else{
      //Update status of user
      mongoClient.connect(url, function(err, db) {
        if (err) throw err;		 
        var twitter = db.db("twitter");
        var newvalues = { $set: { status: "active" } };
        twitter.collection("users").updateOne({username: username}, newvalues, function(err, res) {
          if (err) throw err;
          console.log("User logged in and updated db: ", username);
            db.close();
          });
      });

      //SESSION COOKIE
      if (username !== undefined)
        req.session.username = username;
      res.send({status: "OK"});
      //RENDER FEED
    }
  });
});

/* Log out of Account */
router.post('/logout', function(req, res){
    //if user is not logged in, return status: "error"
    req.session.username = null;
    res.send({status: "OK"});
});

/* Add Item */
router.post('/additem', function(req, res){
  //Post a new item
  //Only allowed if logged in

  var username = req.session.username;

  if(username === undefined || username === null){
    console.log("no user is logged in");
    res.send({status: "error"});
  }else{
    var content = req.body.content;
    var childType = req.body.childType;
    /* 
      error-checking for content/childtype
    */

    console.log("content: " + content + " childType: " + childType);
    /*
      check if logged in using session cookie
    */
    var timestamp = new Date().toISOString();
    var item = {username: username, property: {likes: 0}, retweeted: 0, content: content, timestamp: timestamp};
    
    addNewItem(item, function(err, id){
      // res.render('verify', {key: key, username: username});
      console.log("id returned: " + id);
      res.send({status: "OK", id: id});
    });
  }
  

});

/* Get Item by ID */
router.get('/item/:id', function(req, res){
    //Get contents of a single item given an ID
    console.log("req.params.id: " + req.params.id);
    res.send({status: "OK"});
});
      
/* Search for items by timestamp */
router.post('/search', function(req, res){
  //Gets a list of the latest <limit> number of items prior to (and including) the provided <timestamp>
  var timestamp = req.body.timestamp;
  var limit = 0;
  if (req.body.limit === undefined || req.body.limit === null) {
    limit = 25; // default
  } else {
    limit = req.body.limit;
  }
  searchByTimestamp(timestamp, limit, function(err, items){
    res.send({status: "OK", items: items}); // items is an array of item objects
    // res.send({status:"error"});
  });
});


/*** HELPERS ***/
//Check for unique email & username
function checkInfo(email, username, callback){
  // console.log("checkEmail: " + email);
  mongoClient.connect(url, function(err, db) {
    if (err) throw err;

    console.log("connect: " + email);
		var twitter = db.db("twitter");
		twitter.collection("users").findOne({$or: [{email: email}, {username: username}]}, function(err, res) {
      if (err) throw err;

      if(res !== null){
        if(res.email === email){
          var string = "Email already exists: " + res.email;
          console.log(string);
          callback(err, string);
          db.close();
        }else if(res.username === username){
          var string = "Username already exists: " + res.username;
          console.log(string);
          callback(err, string);
          db.close();
        }
      }else{
        callback(err, undefined);
      }

      db.close();
    });
  });
}

//Add user to database
function addNewUser(user, callback){
  mongoClient.connect(url, function(err, db) {
		if (err) throw err;		
		var twitter = db.db("twitter");
		twitter.collection("users").insertOne(user, function(err, res) {
			if (err) throw err;
      console.log("New user added to database: ", user);
      callback(err, user.email);
			db.close();
		});
	});
}

//Add user to database
function addNewItem(item, callback){
  mongoClient.connect(url, function(err, db) {
		if (err) throw err;		
		var twitter = db.db("twitter");
		twitter.collection("items").insert(item, function(err, res) {
      if (err) throw err;
      console.log("New item added to database: ", res.insertedIds[0]);
      callback(err, res.insertedIds[0]);
			db.close();
		});
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
function checkKey(email, key, callback){
  mongoClient.connect(url, function(err, db) {
    if (err) throw err;
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
      db.close();
    });
  });
}

//Update user's status to verified
function verifyUser(email){
  mongoClient.connect(url, function(err, db) {
    if (err) throw err;		 
    var twitter = db.db("twitter");
    var newvalues = { $set: { status: "verified" } };
	  twitter.collection("users").updateOne({email: email}, newvalues, function(err, res) {
      if (err) throw err;
      console.log("Verified user and updated db: ", email);
        db.close();
      });
  });
}

//Check username & password & verification
function checkLogin(username, password, callback){
  mongoClient.connect(url, function(err, db) {
    if (err) throw err;
	  var twitter = db.db("twitter");
	  twitter.collection("users").findOne({username: username}, function(err, res) {
      if (err) throw err;
      if(res !== null){
        console.log("RESULT: ", res);
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
      db.close();
    });
  });
}

function getStatus(username, callback){
  mongoClient.connect(url, function(err, db) {
    if (err) throw err;
	  var twitter = db.db("twitter");
	  twitter.collection("users").findOne({username: username}, function(err, res) {
      if (err) throw err;
      if(res !== null){
        console.log("RESULT: ", res);
        var status = res.status;
        callback(err, status);
      }else{
        callback(err, "null");
      }
      db.close();
    });
  });
}

// Search for <limit> newest number of items from <timestamp> and return the array of items
function searchByTimestamp(timestamp, limit, callback){
  mongoClient.connect(url, function(err, db) {
		if (err) throw err;		
    var twitter = db.db("twitter");
    var options = {"limit":20};
		twitter.collection("items").find({"timestamp":{$gte:100}}, options).toArray(function(err, items_found) {
			if (err) throw err;
      console.log("items found: ", items_found);
      callback(err, items_found);
			db.close();
		});
	});
}

module.exports = router;
