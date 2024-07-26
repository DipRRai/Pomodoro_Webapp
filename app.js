console.clear();
const express = require('express');
const app = express();
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const bodyParser = require('body-parser');
const { ObjectId } = mongoose.Types;
const Decimal = require('decimal.js');

// Middleware
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(bodyParser.urlencoded({ extended: false }));

// Set up EJS as the templating engine
app.set('view engine', 'ejs');

// MongoDB Connection
mongoose.connect('mongodb://localhost:27017/WebApp')
.then(() => {
    console.log('MongoDB connected');
}).catch(err => {
    console.error('MongoDB connection error:', err);
});

// Set up sessions
app.use(session({
    secret: 'your_secret_key',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: 'mongodb://localhost:27017/WebApp',
        collectionName: 'sessions'
    }),
    cookie: { maxAge: 1000 * 60 * 60 * 24 } // 1 day
}));

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    coins: { type: Number, required: true, default: 0.0}
});

const timerSchema = new mongoose.Schema({
    programID: { type: mongoose.Schema.Types.ObjectId, ref: 'TimerProgram', required: true },
    name: {
        type: String,
        required: true,
        enum: ['study', 'break'] // Only allow 'study' or 'break'
    },
    duration: {
        type: Number,
        required: true
    }
});

// Define the TimerProgram schema
const timerProgramSchema = new mongoose.Schema({
    userID: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: {type: String, required: true}
});

const dueDateSchema = new mongoose.Schema({
    userID: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    dateTime: { type: Date, required: true },
    title: { type: String, required: true },
    description: { type: String, required: true }
});


const TimerProgram = mongoose.model('TimerProgram', timerProgramSchema);
const Timer = mongoose.model('Timer', timerSchema);
const User = mongoose.model('Users', userSchema);
const DueDate = mongoose.model('DueDate', dueDateSchema);

app.get('/play-sound', (req, res) => {
    try {
      const soundFilePath = path.join(__dirname, 'public', 'samsung.mp3');
      res.sendFile(soundFilePath);
    } catch (error) {
      console.error('Error playing sound:', error);
      res.status(500).send('Error playing sound');
    }
  });

  app.post('/create-due-date', async (req, res) => {
    const { dueDate } = req.body;
    const { dueTime } = req.body;
    const { title } = req.body;
    const { description } = req.body;
    const dateTime = new Date(`${dueDate}T${dueTime}:00`);
    console.log(description, title, dueTime, dueDate);

    try {
        const newProgram = await DueDate.create({
            userID: req.session.user.id,
            dateTime: dateTime,
            title: title,
            description: description
        });
        res.status(200).render('times', { username: req.session.user.username});
    } catch (error) {
        console.error('Error creating timers:', error);
        res.status(500).json({ status: 'error', message: 'An error occurred while creating timers.' });
    }
});

  app.post('/delete-program/:parsedProgramID', async (req, res) => {
    const { parsedProgramID } = req.params;
    console.log(parsedProgramID);
    try {
      await Timer.deleteMany({ programID: parsedProgramID });
      await TimerProgram.findOneAndDelete({ _id: parsedProgramID });
      res.status(200).send('Program and associated timers deleted successfully');
    } catch (error) {
      console.error(error);
      res.status(500).send('Failed to delete program and associated timers');
    }
  });
  

app.post('/create-timer-program', async (req, res) => {
    const { timers } = req.body;
    const { programName } = req.body;

    try {
        const newProgram = await TimerProgram.create({
            userID: req.session.user.id,
            name: programName
        });
        for (let i = 0; i < timers.length; i++) {
            await Timer.create({
                programID: newProgram.id,
                name: timers[i].name,
                duration: (Number(timers[i].hours) * 60 + Number(timers[i].minutes))
            });
        }
        console.log(`${timers.length} timers created.`);
        res.status(200).json({ status: 'complete' });
    } catch (error) {
        console.error('Error creating timers:', error);
        res.status(500).json({ status: 'error', message: 'An error occurred while creating timers.' });
    }
});




app.post('/register', async (req, res) => {
    try {
        const hashedPassword = await bcrypt.hash(req.body.password, 10);
        const newUser = await User.create({
            username: req.body.username,
            password: hashedPassword
        });
        res.status(200).sendFile(path.join(__dirname, 'register_success.html'));
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

app.post('/delete-pomodoro', async (req, res) => {
    const { timerName } = req.body;
    try {
        // Use Mongoose to find the pomodoro and delete it
        const deletedPomodoro = await TimerProgram.findOneAndDelete({ timerName });

        if (!deletedPomodoro) {
            return res.status(404).json({ message: 'Pomodoro not found' });
        }

        res.status(200).json({ message: 'Pomodoro deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});


// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/times', (req,res)=>{
    res.render('times', { username: req.session.user.username});
})

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const existingUser = await User.findOne({ username });
        if (!existingUser) {
            return res.status(404).json({ message: 'User not found' });
        }
        // Validate password
        const isPasswordValid = await bcrypt.compare(password, existingUser.password);
        if (!isPasswordValid) {
            return res.status(401).json({ message: 'Invalid password' });
        }
        // Store user data in session
        req.session.user = {
            id: existingUser._id,
            username: existingUser.username,
            coins: existingUser.coins
        };
        res.status(200).redirect(`/dashboard`);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

app.get('/dashboard', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).redirect('/login');
    }
    const dueDates = await DueDate.find({ userID: req.session.user.id });
    const user = await User.findOne({ username: req.session.user.username });
    const programs = await TimerProgram.find({ userID: req.session.user.id });
    const coins = user ? user.coins : 0;
    //console.log(programs);
    res.render('dashboard', { username: req.session.user.username, coins: coins, programs: programs, dueDates: dueDates });
});

app.get('/timerdata/:programID', async (req, res) => {
    const { programID } = req.params;
    try {
        const timers = await Timer.find({ programID: programID });
        const dueDates = await DueDate.find({ userID: req.session.user.id });
        if (!timers.length) {
            return res.status(404).json({ message: "No timers found for the specified program." });
        }
        if (!req.session.user) {
            return res.status(401).redirect('/login');
        }
        const user = await User.findOne({ username: req.session.user.username });
        const programs = await TimerProgram.find({ userID: req.session.user.id });
        const coins = user ? user.coins : 0;
        res.render('dashboardActive', { username: req.session.user.username, coins: coins, programs: programs, timers: timers, dueDates: dueDates });
    } catch (error) {
        console.error("Error fetching timers:", error);
        res.status(500).json({ error: "An error occurred while fetching the timers." });
    }
});


app.post('/increment-coins', async (req, res) => {
    if (!req.session.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
  
    const { coins } = req.body;
  
    try {
      await User.updateOne(
        { username: req.session.user.username },
        { $inc: { coins: Number(coins) } } // Convert coins to Number for incrementing
      );
  
      req.session.user.coins = req.session.user.coins + Number(coins); // Update the session data correctly
      res.status(200).json({ message: 'Coins incremented successfully' });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  


app.get('/profile', (req, res) => {
    if (!req.session.user) {
        return res.status(401).redirect('/login');
    }
    res.render('profile', { username: req.session.user.username });
});

app.get('/due-dates', (req, res) => {
    if (!req.session.user) {
        return res.status(401).redirect('/login');
    }
    res.render('due-dates', { username: req.session.user.username });
});

app.get('/feed', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).redirect('/login');
    }
    try {
        const users = await User.find({ });
        res.render('feed', { username: req.session.user.username, users });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

app.get('/leaderboard', async (req, res) => {
    try {
        // Find all users and sort by coins in descending order
        const users = await User.find({}).sort({ coins: -1 });

        res.render('leaderboard', { username: req.session.user.username, users });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});


app.get('/signout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ message: 'Failed to log out' });
        }
        res.redirect('/login');
    });
});

// Start Server
const PORT = 5000;
app.listen(PORT,'0.0.0.0', () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
