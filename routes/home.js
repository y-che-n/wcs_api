var secrets = require('../config/secrets');

var Event = require('../models/event');
var User = require('../models/user');

module.exports = function (router) {

  var homeRoute = router.route('/');

  homeRoute.get(function (req, res) {
    var connectionString = secrets.token;
    res.json({ message: 'My connection string is ' + connectionString });
  });

  var eventsRoute = router.route('/events');

  eventsRoute.get(function (req, res) {
    var query = Event.find({});

    query.exec(function (err, events) {
      if (err) return res.status(500);
      res.json({ message: 'OK', data: events });
    })
  });


  var usersRoute = router.route('/users');

  usersRoute.get(function (req, res) {
    console.log(req)
    var errMsg = '';
  //  if (req.headers.pw != secrets.pw) {
  //    errMsg += 'Incorrect password! '
  //  }
    if (errMsg) {
      errMsg = 'Validation error(s): ' + errMsg;
      console.log(errMsg);
      return res.status(500).json({ message: errMsg, data: [] });
    }

    var query = User.find({});

    query.exec(function (err, users) {
      if (err) return res.status(500);
      res.json({ message: 'OK', data: users });
    })
  });

  eventsRoute.post(function (req, res) {
    var errMsg = '';

    if (!req.body.name) {
      errMsg += 'An event name is required! ';
    }

    if (!req.body.points) {
      errMsg += 'A point value for the event is required! ';
    }

    if (!req.body.date) {
      errMsg += 'A date for the event is required! '
    }

    if (!req.body.pw) {
      errMsg += 'A password is required! '
    }

    if (req.body.pw != secrets.pw) {
      errMsg += 'Incorrect password! '
    }

    if (errMsg) {
      errMsg = 'Validation error(s): ' + errMsg;
      console.log(errMsg);
      return res.status(500).json({ message: errMsg, data: [] });
    }

    console.log(req.body);

    event_key = generateEventKey();
    event_date = new Date(req.body.date);
    expirationDate = new Date(event_date).setHours(event_date.getHours() + 2);
    console.log(expirationDate);

    var newEvent = new Event({
      name: req.body.name,
      date: req.body.date,
      points: req.body.points,
      category: req.body.category,
      key: event_key,
      expiration: expirationDate
    });

    newEvent.save(function (err) {
      if (err) return res.status(500).json({ message: 'Error with creating the event', data: [] });
      res.status(201).json({ message: 'Event created!', data: newEvent });
    });
  })

  var eventIdRoute = router.route('/events/:id');

  eventIdRoute.get(function (req, res) {
    Event.findOne({ _id: req.params.id }, function (err, event) {
      if (err || !event) return res.status(404).json({ message: 'Event not found', data: [] });
      res.json({ message: 'OK', data: event });
    })
  });


  eventIdRoute.put(function (req, res) {
    const netid = req.body.netid;

    let valid = validate_netid(netid);
    if (valid === false) return res.status(404).json({message: 'invalid netid', data: []});

    Event.findOne({ _id: req.params.id }, function (err, event) {
      if (err || !event) return res.status(404).json({ message: 'event not found', data: [] });
      if (req.body.event_key != event.key) return res.status(404).json({message: 'invalid event key', data: []});
      let currentTime = new Date();
      if (currentTime < event.date || currentTime > event.expiration) return res.status(404).json({message: 'event is not running', data: []})
      if (event.attendees.includes(netid)) {
        return res.status(201).json({message: 'already signed in', data: event});
      }
      event.attendees.push(netid);
      event.save(function (err) {
        if (err) return res.status(500).json({ message: 'error with updating the event', data: [] });

        User.findOne({ netid: req.params.netid }, function (e, user) {
          if (err) {
            return res.status(500);
          }

          if (!user) {
            // Create a user if they don't exist
            var newUser = new User({
              netid: req.params.id,
              points: 0,
              office_hours: [],
              committees: []
            });

            newUser.save(function (err) {
              if (err) return res.status(500).json({ message: 'Error with creating the user', data: [] });
            });

            targetUser = newUser;
          } else {
            targetUser = user;
          }

          targetUser.points = targetUser.points + event.points;
          targetUser.save(function (err) {
            if (err) return res.status(500).json({ message: 'Error with updating the user', data: [] });
            res.status(201).json({ message: 'Successfully signed in!', data: event});
          })
        })
      });
    })
  })

  var userRoute = router.route('/users/:id');

  userRoute.put(function (req, res) {
    var type = req.body.type;
    var date = req.body.date;
    var netid = req.params.id;

    let valid = validate_netid(netid);
    if (valid === false) return res.status(404).json({message: 'Invalid netid', data: []});

    var targetUser;

    User.findOne({
      netid: req.params.id
    }, function(err, user) {

      if (err) {
        return res.status(500);
      }

      if (!user) {
        // Create a user if they don't exist
        var newUser = new User({
          netid: req.params.id,
          office_hours: [],
          committees: []
        });

        newUser.save(function (err) {
          if (err) return res.status(500).json({ message: 'Error with creating the user', data: [] });
        });

        targetUser = newUser;
      } else {
        targetUser = user;
      }
      // Update userstats w/ committee & oh pts

      if (type === 'committee') {
        if (targetUser.committees.includes(date) === false)
          targetUser.committees.push(date);
      } else if (type === 'office_hours') {
        if (targetUser.office_hours.includes(date) === false)
          targetUser.office_hours.push(date);
      }

      targetUser.save(function (err) {
        if (err) return res.status(500).json({ message: 'Error with updating the user', data: [] });
        res.json({ message: 'OK', data: targetUser });
      })
    });
  });

  userRoute.get(function (req, res) {

    var userStats = {
      'attended_events': [],
      'committees': [],
      'office_hours': []
    };

    var targetUser;

    let valid = validate_netid(req.params.id);
    if (valid === false) return res.status(404).json({message: 'Invalid netid', data: []});

    User.findOne({
      netid: req.params.id
    }, function(err, user) {

      if (err) {
        return res.status(500);
      }

      if (!user) {
        // Create a user if they don't exist
        var newUser = new User({
          netid: req.params.id,
          office_hours: [],
          committees: []
        });

        newUser.save(function (err) {
          if (err) return res.status(500).json({ message: 'Error with creating the user', data: [] });
        });

        targetUser = newUser;
      } else {
        targetUser = user;
      }

      // Update userstats w/ committee & oh pts
      userStats.committees = targetUser.committees;
      userStats.office_hours = targetUser.office_hours;;

    // Totals up points for User
    var query = Event.find({});
    query.exec(function (err, events) {
      if (err) return res.status(500);

      events.forEach(function (event) {
        if(event.attendees.includes(req.params.id)) {
          userStats.attended_events.push(event);
        }
      })
      res.json({ message: 'OK', data: userStats });
    })
  });
      });

  return router;
}

function validate_netid(netid) {
  const re = new RegExp('\\b[a-z]+\\d{1,3}\\b');
  return re.test(netid);
}

function generateEventKey() {
  i = Math.floor(Math.random() * 100);
  j = Math.floor(Math.random() * 100);

  return secrets.first_word[i] + ' ' + secrets.second_word[j];
}
