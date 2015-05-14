require('dotenv').load();
var Slack = require('slack-client');
var _ = require('lodash');
var Algolia = require('algoliasearch');
var superagent = require('superagent');

var algoliaClient = Algolia(process.env.ALGOLIA_APP_ID, process.env.ALGOLIA_API_KEY);
var appstoreSearch = algoliaClient.initIndex(process.env.ALGOLIA_INDEX);

var token = process.env.SLACK_API_TOKEN;
var autoReconnect = true;
var autoMark = true;

var slack = new Slack(token, autoReconnect, autoMark);

slack.on('open', function () {
  channels = [];
  groups = [];
  unreads = slack.getUnreadCount();
  _.forEach(slack.channels, function (channel, id) {
    if (! channel.is_member) {
      return;
    }
  });
});

slack.on('message', function (message) {
  var channel = slack.getChannelGroupOrDMByID(message.channel);
  var user = slack.getUserByID(message.user);
  var response = '';
  if (! isMessageForMe(message)) {
    return;
  }
  var request = getRequest(message);
  switch (request.type) {
    case 'appstore.url':
    case 'appstore.hearts':
      doAppstoreRequest(request, channel);
    break;
    case 'docs':
      doDocsRequest(request, channel);
    break;
    default:
      console.log('Could not handle: ' + message);
      // TODO: What should we do here?
  }
});

slack.on('error', function (err) {
  console.log(err);
});

function isMessageForMe(message) {
  return (message.text && message.text.substr(0, 14) == '<@U04RW8V6R>: ');
}

function getRequest(message) {
  var messageText = message.text.substr(14);
  if (messageText.substr(0, 8) === ':heart: ') {
    return {
      type: 'appstore.hearts',
      data: messageText.substr(8)
    };
  }
  if (messageText.substr(0, 7) === ':book: ') {
    return {
      type: 'docs',
      data: messageText.substr(7)
    };
  }
  return {
    type: 'appstore.url',
    data: messageText
  };
}

function doAppstoreRequest(request, channel) {
  appstoreSearch.search(request.data, function searchDone(err, content) {
    if (err) {
      return console.log(err);
    }
    if (! content.hits.length) {
      return channel.send('Could not find an app with that name. Sorry! :sob:');
    }
    var app = content.hits[0];
    superagent.get('https://appstore-api.getpebble.com/v2/apps/id/' + app.id + '?hardware=basalt').end(function (err, res) {
      switch (request.type) {
        case 'appstore.url':
          channel.postMessage({
            as_user: true,
            attachments: [
              {
                fallback: app.title + ' v' + app.version,
                title: app.title + ' v' + app.version,
                title_link: 'https://apps.getpebble.com/applications/' + app.id,
                fields: [
                  {
                    title: 'Description',
                    value: app.description
                  }
                ],
                image_url: _.get(res.body, 'data[0].screenshot_images[0].144x168', app.screenshot_images[0]),
                author_name: app.author,
              }
            ]
          });
          break;
        case 'appstore.hearts':
          channel.send(app.title + ' currently has ' + app.hearts + ' :heart:');
          break;
      }
    });
  });
}

function doDocsRequest(request, channel) {
  superagent.get('https://developer.getpebble.com/docs/symbols.json').end(function (err, res) {
    if (err) {
      return console.log(err);
    }
    if (! res.body || ! res.body.length) {
      return console.log(err);
    }
    var symbol = _.findWhere(res.body, { name: request.data });
    channel.send(symbol.summary);
  });
}

slack.login();