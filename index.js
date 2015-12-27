// our handy library
var google = require('googleapis');

// this is optional, but helpful
var Promise = require('bluebird');

// just a utility library (handy, if you haven't used it before)
var _ = require('lodash');

// command line parsing
var argv = require('yargs').argv;

// see below in "Finding your secret.json" to find out how to get this
var key = require('../../../secret.json');

// I'm using my package.json as my source of truth for my versioning
var version = require('../../../package.json').version;

// any unique id will do; a timestamp is easiest
var editId = ''+(new Date().getTime());

// editing "scope" allowed for OAuth2
var scopes = [
  'https://www.googleapis.com/auth/androidpublisher'
];

// here, we'll initialize our client
var OAuth2 = google.auth.OAuth2;
var oauth2Client = new OAuth2();
var jwtClient = new google.auth.JWT(key.client_email, null, key.private_key, scopes, null);
var play = google.androidpublisher({
  version: 'v2',
  auth: oauth2Client,
  params: {
    // default options
    // this is the package name for your initial app you've already set up on the Play Store
    packageName: 'com.example.app'
  }
});

google.options({ auth: oauth2Client });

// "open" our edit
startEdit()
.then(function(data) {
  var apk = require('fs').readFileSync('./Chronicled.apk');

  // stage the upload (doesn't actually upload anything)
  return upload({
    edit: data.edit,
    apk: apk
  });

}).then(function(data) {

  // set our track
  return setTrack(data);

}).then(function(data) {

  // commit our changes
  return commitToPlayStore(data);

}).then(function(data) {

  // log our success!
  console.log('Successful upload:', data);

})
.catch(function(err) {
  console.log(err);
  process.exit(0);
});

/**
 *  Sets our authorization token and begins an edit transaction.
 */
function startEdit() {
  return new Promise(function(resolve, reject) {
    // get the tokens
    jwtClient.authorize(function(err, tokens) {
      if(err) {
        console.log(err);
        return;
      }

      // set the credentials from the tokens
      oauth2Client.setCredentials(tokens);

      play.edits.insert({
        resource: {
          id: editId,
          // this edit will be valid for 10 minutes
          expiryTimeSeconds: 600
        }
      }, function(err, edit) {
        if(err || !edit) {
          reject(err);
        }

        resolve({
          edit: edit
        });
      });
    });
  });
}

/**
 *  Stages an upload of the APK (but doesn't actually upload anything)
 */
function upload(data) {
  var edit = data.edit;
  var apk = data.apk;

  return new Promise(function(resolve, reject) {
    play.edits.apks.upload({
      editId: edit.id,
      media: {

        mimeType: 'application/vnd.android.package-archive',
        body: apk
      }
    }, function(err, res) {
      if(err || !res) {
        reject(err);
      }

      // pass any data we care about to the next function call
      resolve(_.omit(_.extend(data, { uploadResults: res }), 'apk'));
    });
  });
}

/**
 *  Sets our track (beta, production, etc.)
 */
function setTrack(data) {
  var edit = data.edit;
  var track = tracks[argv[0] || 'alpha'];

  return new Promise(function(resolve, reject) {
    play.edits.tracks.update({
      editId: edit.id,
      track: track,
      resource: {
        track: track,
        versionCodes: [+data.uploadResults.versionCode]
      }
    }, function(err, res) {
      if(err || !res) {
        reject(err);
      }

      resolve(_.extend(data, { setTrackResults: res }));
    });
  });

}

/**
 *  Commits our edit transaction and makes our changes live.
 */
function commitToPlayStore(data) {
  return new Promise(function(resolve, reject) {
    play.edits.commit({
      editId: data.edit.id
    }, function(err, res) {
      if(err || !res) {
        reject(err);
      }

      resolve(_.extend(data, { commitToPlayStoreResults: res }));
    });
  });
}