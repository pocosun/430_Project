//Imports, globals, and ports
var http = require('http'),
	fs = require('fs'),
	socketio = require('socket.io'),
	async = require('async'),
	discogs = require("disconnect").Client,
	config = require('./config/config.js'),
	rovi = require('rovijs'),
	echo = require('echonestjs'),
	port = process.env.PORT || process.env.NODE_PORT || 3000,
	index = fs.readFileSync(__dirname + '/../client/index.html');

//initializing the Rovi and Echo keys
rovi.init(config.rovi.key, config.rovi.secret);
echo.init(config.echo.key);
var dis = new discogs({userToken: 'xQSstXxQtGrcxUDRGSHJYjshQcuqYgbsBQlMKagH'});
var db = dis.database();

//Basic onRequest
var onRequest = function(req, res){
	res.writeHead(200,{"Content-Type": "text/html"});
	res.end(index);
};

//finds the influeners using rovi
var findInflu = function(data, callback){
	rovi.get("name/influencers", { "name": data}, function (err, res) {
		if(err){
			console.log(err);
		}
		else{
			callback(null, res.influencers[0].name);
		}
	});
	
};

//finds similarities using echonest
var findSimilar = function(data, callback){
	var artistnames = [data.first, data.second];

	echo.get("artist/similar", {"name": artistnames }, function (err, res) {
		if(err){
			console.log(err);
		}
		else{
			callback(null, res.response.artists[0]);
		}
	});
	
};

//Find Images for artist using discogs
//Currently only logs images
var findPhoto = function(data, callback){
	db.search(data, {'type': 'artist'}, function(err, data){

		db.artist(data.results[0].id, function(err, data2) {
		   if(err){
			console.log(err);
			}
			else{
				callback(null, data2.images[0].resource_url);
			}
		}); 
	});		
};

//Finds video for artist
//A regular URL is returned from API services so we need to replace the URL to add the "embed" to make it website friendly
//Will need to check for all video sources (youtube, dailymotion, etc)
//Possible more effiecient way?
var findVideo = function(data, callback){
	echo.get("artist/video", { "name": data}, function (err, res) {
		if(err){
			console.log(err);
		}
		else{
			var oURL = res.response.video[0].url;
			var nURL = oURL.replace("http://www.dailymotion.com/", "http://www.dailymotion.com/embed/");
			
			callback(null, nURL);

		}
	});
};

//Calls each function and makes it into a single object
var makePackage = function(data, socket){
	var dataPackage = {
		first: {
			images: [],
			video: [],
			influencers: []
		},
		second: {
			images: [],
			video: [],
			influencers: []
		},
		similar: {
			images: [],
			video: [],
			influencers: []
		}
	};

	//Async.js allows us to call multiple async functions at once 
	//and then wait for a reply from all of them before continuing
	async.parallel(
		{
			firstVideo: function(callback){
				findVideo(data.first, callback);
			},
			secondVideo: function(callback){
				findVideo(data.second, callback);
			},
			firstImg: function(callback){
				findPhoto(data.first, callback);
			},
			secondImg: function(callback){
				findPhoto(data.second, callback);
			},
			firstInflu: function(callback){
				findInflu(data.first, callback);
			},
			secondInflu: function(callback){
				findInflu(data.second, callback);
			},
			similar: function(callback){
				findSimilar(data, callback);
			}
		},
		function(err, results){
			dataPackage.first.video.push({'url': results.firstVideo});
			dataPackage.second.video.push({'url':results.secondVideo});
			dataPackage.first.images.push({'url':results.firstImg});
			dataPackage.second.images.push({'url':results.secondImg});
			dataPackage.first.influencers.push({'name':results.firstInflu});
			dataPackage.second.influencers.push({'name':results.secondInflu});

			async.parallel(
				{
					similarVideo: function(callback){
						findVideo(results.similar.name, callback);
					},
					similarImg: function(callback){
						findPhoto(results.similar.name, callback);
					},
					similarInflu: function(callback){
						findInflu(results.similar.name, callback);
					}
				},
				function(err,results){
					dataPackage.similar.video.push({'url': results.similarVideo});
					dataPackage.similar.images.push({'url':results.similarImg});
					dataPackage.similar.influencers.push({'name':results.similarInflu});

					console.log(dataPackage);

					//socket.emit('package', dataPackage);
				}
			);
		}
	);
};

//onJoin test
var onJoined = function(socket){
	var msg = "Hey";
	socket.emit('init', msg);
	makePackage({'first': 'Beach Boys', 'second': 'Spice Girls'}, socket);

	//Make the package
	socket.on('serverArtist', function(data){
		makePackage(data, socket);
	});
};

//Socket.io listening to ports for connections
var app = http.createServer(onRequest).listen(port);
var io = socketio(app);
io.sockets.on("connection", function(socket){
	onJoined(socket);
});

console.log('Listening in on port ' + port);