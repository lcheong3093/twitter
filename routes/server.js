var express = require('express');
var router = express.Router();

var mongo = require('mongodb');
var mongoClient = mongo.MongoClient;
var url = "mongodb://localhost"

var nodemailer = require('nodemailer');
var rand = require('generate-key');

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('signin');
});

/* Create Account */
router.post('/adduser', function(req, res) {
  var username = req.body.username.toLowerCase();
  var email = req.body.email.toLowerCase();
  var password = req.body.password;

  if(username == ""){
    res.send("Please enter a username");
    //res.send({status: "error"});
  }else if(email == ""){
    res.send("Please enter an email");
    //res.send({status: "error"});
  }else if(password == ""){
    res.send("Please enter a password");
    //res.send({status: "error"});
  }

  console.log("User: " + username + " Email: " + email + " Pass: " + password);

  checkInfo(email, username, function(err, string){
    if(err){ 
      throw err;
      // res.send({status: "error"});
    }

    if(string !== undefined){
      res.send(string);
      // res.send({status: "error"});
    }else{
      var user = {email: email, username: username, password: password, status: "unverified"};
      addNewUser(user, function(err, email){
        var key = rand.generateKey();
        sendVerification(email, key);
        res.render('verify', {key: key, username: username});
        // res.send({status: "OK"});
      });
    }
  });

});

/* Verify Account */
router.post('/verify', function(req, res) {
  if(req.body.key !== req.body.verification){
    res.render('verifyerror', {key: req.body.key, username: req.body.username});
    // res.send({status: "error"});
  }else{
    verifyUser(req.body.username);
    res.render('login');
    // res.send({status: "OK"});
  }
}); 

/* Log into Account */
router.post('/login', function(req, res){
  var username = req.body.username;
  var password = req.body.password;

  checkLogin(username, password, function(err, string){
    if(string !== undefined){
      // res.send({status: "error"});
      res.send(string);
    }else{
      res.send({status: "OK"});
      //RENDER FEED
    }
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

//Send verification email w/ key
function sendVerification(email, key){
  var message = "validation key: " + key;

  const transport = nodemailer.createTransport({
		host: 'smtp.gmail.com',
		port: 465,
		secure: true,
		auth: {
		  user: 'twittercloud356@gmail.com',
		  pass: 'twoCOMESafterONE'
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

//Update user's status to verified
function verifyUser(username){
  mongoClient.connect(url, function(err, db) {
    if (err) throw err;		
    
    var twitter = db.db("twitter");
    var newvalues = { $set: { status: "verified" } };
		twitter.collection("users").updateOne({username: username}, newvalues, function(err, res) {
      if (err) throw err;
      
      console.log("Verified user and updated db: ", username);
			db.close();
		});
	});
}

//Check username & password & verification
function checkLogin(username, password){
  mongoClient.connect(url, function(err, db) {
    if (err) throw err;

    console.log("connect: " + email);
		var twitter = db.db("twitter");
		twitter.collection("users").findOne({username: username}, function(err, res) {
      if (err) throw err;

      if(res !== null){
        if(res.password !== password){
          callback(err, "Incorrect password");
        }else if(res.status !== "verified"){
          callback(err, "Please verify your account");
        }else{
          callback(err, undefined);
        }
      }else{
        callback(err, "Can't find user");
      }

      db.close();
    });
  });
}

module.exports = router;
