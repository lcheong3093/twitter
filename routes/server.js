var express = require('express');
var router = express.Router();

var mongo = require('mongodb');
var mongoClient = mongo.MongoClient;
var url = "mongodb://localhost"


/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('welcome');
});

router.post('/adduser', function(req, res) {
  var username = req.body.username.toLowerCase();
  var email = req.body.email.toLowerCase();
  var password = req.body.password;

  console.log("User: " + username + " Email: " + email + " Pass: " + password);

  checkEmail(email, username, function(err, string){
    if(err) throw err;

    if(string !== undefined)
      res.send(string);
    else{
      var user = {email: email, username: username, password: password, status: "unverified"};
      addNewUser(user);
    }
  });

});

router.post('/verify', function(req, res) {
  
}); 

/*Checks for unique email*/
function checkEmail(email, username, callback){
  console.log("checkEmail: " + email);
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

function addNewUser(user){
  mongoClient.connect(url, function(err, db) {
		if (err) throw err;		
		var twitter = db.db("twitter");
		twitter.collection("users").insertOne(user, function(err, res) {
			if (err) throw err;
			console.log("New user added to database: ", user);
			db.close();
		});
	});
}

module.exports = router;
