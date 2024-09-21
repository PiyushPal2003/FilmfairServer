const express = require("express");
require('./connect');
const apidata = require("./schema/api");
const userdb = require("./schema/user");
require('dotenv').config({ path: '.env' });
const jwt = require("jsonwebtoken");
const moment = require("moment");
const bcrypt = require("bcryptjs");
const stripe = require('stripe')(process.env.STRIPE_API_KEY);

const cors = require("cors");
const port = process.env.PORT || 5000;
const app = express();


app.post("/hooks", express.raw({type: 'application/json'}), async(req,res)=>{
    let signingsecret = process.env.STRIPE_SIGNING_SECRET;

    const payload = req.body
    const sig = req.headers['stripe-signature'];

    //matching
    let event 
    try{
        event = stripe.webhooks.constructEvent(payload,sig,signingsecret)
    } catch(e){
        //console.log("Attention PIYUSH WEBHOOK ERROR (line 235)" + e);
        res.status(400).json({success: false});
        return
    }

    //if successfull i.e no error
    // //console.log(event.type)
    // //console.log(event.data.object)
    res.status(200).json({success:true})


    switch (event.type) {

        case 'customer.updated':
            const cust_updt = event.data.object;
            //console.log("inside customer updated, line (44)........................................................................")
            try{
                const dt = await userdb.findOneAndUpdate(
                    { UserEMAIL: cust_updt.email },
                    {
                      $set: {
                        'Subscription.custID': cust_updt.id,
                      }
                    }, { new: true } );
                  if(dt){
                    //console.log("user found LINE(54) CUSTOMER UPDATED WEBHOOK") 
                }
                  else{
                    //console.log("user not found CUSTOMER UPDATED WEBHOOK") 
                }
                }
            catch(e){
                //console.log("CUSTOMER UPDATED WEBHOOK ERROR PIYUSH.........." + e) 
            }

            break;



        case 'customer.subscription.updated':
            const subs_updated= event.data.object;
            //console.log("Inside CustomerSubscriptionUpdated CONSOLED LOGGED LINE(67)........................................................")
            const startdt= moment.unix(subs_updated.current_period_start).format('YYYY-MM-DD')
            const enddt= moment.unix(subs_updated.current_period_end).format('YYYY-MM-DD')

            //console.log(subs_updated.current_period_start)
            //console.log(subs_updated.current_period_end)
            //console.log("- - - - - - - - DATE LINE(73)")
            //console.log(startdt, typeof startdt)
            //console.log(enddt, typeof enddt)
            
            try{
                const dt = await userdb.findOneAndUpdate(
                    { 'Subscription.custID': subs_updated.customer },
                    {
                      $set: {
                        'Subscription.amtPaid': subs_updated.plan.amount,
                        'Subscription.subscriptionID': subs_updated.id,
                        'Subscription.startDate': startdt,
                        'Subscription.endDate': enddt,
                      }
                    }, { new: true } );
                  if(dt){
                    //console.log("user found LINE(86), Subscription Updated Webhook") 
                }
                  else{
                    //console.log("user not found, Subscription Updated Webhook") 
                }
                    
                } catch(err){
                    //console.log("Subscription Updated ERROR PIYUSH.........." + err)
                }
            

            break;


        case 'invoice.paid':
          const invoice_paid = event.data.object;
          //console.log("Inside Invoice Paid LINE(99)...........................................................................")

          try{
            const dt = await userdb.findOneAndUpdate(
                { 'Subscription.custID': invoice_paid.customer },
                {
                  $set: {
                    'Subscription.cust_email': invoice_paid.customer_email,
                    'Subscription.cust_name': invoice_paid.customer_name,
                    'Subscription.paymentStatus': invoice_paid.status,
                    'Subscription.invoiceUrl': invoice_paid.hosted_invoice_url,
                  }
                }, { new: true } );
              if(dt){
                //console.log("user found LINE(113), INVOICE PAID WEBHOOK") 
            }
              else{
                //console.log("user not found, INVOICE PAID WEBHOOK") 
            }
                
            } catch(err){
                //console.log("INVOICE PAID ERROR PIYUSH.........." + err)
            }
            
            break;
            
            
        default:
        //console.log('Unhandled event type LINE(124)');
      }
  })

app.use(express.json());
app.use(express.urlencoded({extended:false}));
app.use(cors({ origin: 'https://filmfair.vercel.app', credentials: true }));

app.get("/", (req, res)=>{
    res.send("FlimFair Website Server")
});

//MIDDLEWARE.................................................................................................................
const verifyToken = (req, res, next) => {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
        //console.log("unauthorized line115")
      return res.status(401).json({ message: "Unauthorized (jwt middleware line 116)" });
    }

    const token = authHeader.split(" ")[1];

    jwt.verify(token, process.env.JWT_KEY, (err, decoded) => {
      if (err) {
        console.log("unauthorized line123", err)
        return res.status(401).json({ message: "Unauthorized (jwt middleware line 124)" });
      }
    req.user = decoded;
    next();
    console.log('verified line 128');
}); };






app.post("/user_signup", async(req, res)=>{
    const inpres = req.body;
    //console.log(inpres);

    try{
        const dt = await userdb.findOne({UserEMAIL: req.body.user_email})
        if(dt){
            res.json("Email Already Registered")
        }
        else{
            const user = new userdb({
                UserNAME: req.body.user_name,
                UserEMAIL: req.body.user_email,
                UserPASS: req.body.user_pass,
            })
            await user.save();
            res.status(200).json({message: "Saved Sucessfully in MongoDB", userid: user._id});
        }
        
    } catch(err){
        res.status(404).send(err);
    }
})


app.post("/user_signin", async (req, res) => {
    const inpres = req.body;
    //console.log("data received" + inpres);

    try {
        // const dt = await userdb.findOne({ UserEMAIL: req.body.user_email, UserPASS: req.body.user_pass });
        const dt = await userdb.findOne({ UserEMAIL: req.body.user_email});
        if (!dt) {
            //console.log("User with email not found:", user_email);
            return res.status(400).json({ message: "User Not Found" });
        }
        const isMatch = bcrypt.compareSync(req.body.user_pass, dt.UserPASS);
        if (isMatch) {
            //console.log("bcrypt password Matched");
            const endDateString = dt.Subscription.get('endDate');
            const endDate = new Date(endDateString);
            const today = new Date();
            const differenceInMs = Date.UTC(endDate.getFullYear(), endDate.getMonth(), endDate.getDate()) - 
                                Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
            let daysDifference = Math.floor(differenceInMs / (1000 * 3600 * 24));
            const expirationDate = new Date( today.getFullYear(), today.getMonth(), today.getDate() + daysDifference+1, 0, 0, 0, 0 );
            const expirationTimestamp = Math.floor(expirationDate.getTime() / 1000);
            const now = Math.floor(Date.now() / 1000);
            const secondsUntilExpiration = expirationTimestamp - now;

            //console.log('daysDifference is ' + daysDifference);
            //console.log('expirationDate is ', expirationDate)
            //console.log('expirationTimestamp is ', expirationTimestamp)
            //console.log('secondsUntilExpiration is ', secondsUntilExpiration);

            if (daysDifference == 0 || daysDifference > 0) { // User exists and subscription is active
                //if here this means plan is active and now check for all conditions with active plan
                //console.log('inside daysDifference == 0 || daysDifference > 0')
                // 1) Users Fingerprint in db meaning user is logged in already and plan active
                const device = dt.Devices.some(fingerprint => fingerprint === req.body.usrfingerprint)
                if(device){
                    jwt.sign({
                        userID: dt._id.toString(),
                        name: dt.UserNAME,
                        email: dt.UserEMAIL,
                        //sessionID: dt.session_id,
                        paymentStatus: dt.Subscription.get('paymentStatus'),
                        subsID: dt.Subscription.get('subscriptionID'),
                        amtPaid: dt.Subscription.get('amtPaid'),
                        //invoiceUrl: dt.Subscription.get('invoiceUrl'),
                        startDate: dt.Subscription.get('startDate'),
                        endDate: dt.Subscription.get('endDate'),
                    }, process.env.JWT_KEY, { expiresIn: secondsUntilExpiration }, async(err, token) => {
                        if (err) {
                            //console.log("LINE(230)", err);
                            res.status(500).json({ error: err.message });
                        } else {
                            //console.log(token);
                            res.setHeader('Access-Control-Allow-Origin', 'https://filmfair.vercel.app');
                            res.cookie('FilmFairRefresh', token, {
                                expires: expirationDate,
                                httpOnly: false,
                                secure: false,
                                sameSite: 'Strict',
                                domain: 'localhost',
                                path: '/'
                            });
                            //res.json({jwt:token});
                            res.status(200).json({ message:'User Exists && Active', userid: dt._id, jwt: token });
                            //console.log('setCookie initiated');
        
                            // const dtt = await userdb.findOne({ session_id: sesID });
                            // if(dtt){
                                dt.jwt= token;
                                await dt.save();
                                //console.log(" JWT saved in DATABASE ")
                            //}
                        }
                    });
                } else if(!device){
                    if(dt.Subscription.get('amtPaid') == 900){
                        if(dt.Devices.length==1){
                            res.status(210).json({ message: "Device Limit Reached" });
                        } 
                        else if(dt.Devices.length<1){
                            jwt.sign({
                                userID: dt._id.toString(),
                                name: dt.UserNAME,
                                email: dt.UserEMAIL,
                                //sessionID: dt.session_id,
                                paymentStatus: dt.Subscription.get('paymentStatus'),
                                subsID: dt.Subscription.get('subscriptionID'),
                                amtPaid: dt.Subscription.get('amtPaid'),
                                //invoiceUrl: dt.Subscription.get('invoiceUrl'),
                                startDate: dt.Subscription.get('startDate'),
                                endDate: dt.Subscription.get('endDate'),
                            }, process.env.JWT_KEY, { expiresIn: secondsUntilExpiration }, async(err, token) => {
                                if (err) {
                                    //console.log("LINE(230)", err);
                                    res.status(500).json({ error: err.message });
                                } else {
                                    //console.log(token);
                                    res.setHeader('Access-Control-Allow-Origin', 'https://filmfair.vercel.app');
                                    res.cookie('FilmFairRefresh', token, {
                                        expires: expirationDate,
                                        httpOnly: false,
                                        secure: false,
                                        sameSite: 'Strict',
                                        domain: 'localhost',
                                        path: '/'
                                    });
                                    //res.json({jwt:token});
                                    res.status(200).json({ message:'User Exists && Active', userid: dt._id, jwt: token });
                                    //console.log('setCookie initiated');
                
                                    // const dtt = await userdb.findOne({ session_id: sesID });
                                    // if(dtt){
                                        dt.jwt= token;
                                        dt.Devices.push(req.body.usrfingerprint)
                                        await dt.save();
                                        //console.log(" JWT saved in DATABASE ")
                                    //}
                                }
                            });
                        } else{
                            //console.log("the user gave right credentials also plan active but usrfingerprint not in array (meaning user had loggedout, now trying to login) amtpaid by usr is 900 but devices array is not full neiter has space ") 
                            }
                    }
                    else if(dt.Subscription.get('amtPaid') == 4900){
                        if(dt.Devices.length==2){
                            res.status(210).json({ message: "Device Limit Reached" });
                        } 
                        else if(dt.Devices.length<2){
                            jwt.sign({
                                userID: dt._id.toString(),
                                name: dt.UserNAME,
                                email: dt.UserEMAIL,
                                //sessionID: dt.session_id,
                                paymentStatus: dt.Subscription.get('paymentStatus'),
                                subsID: dt.Subscription.get('subscriptionID'),
                                amtPaid: dt.Subscription.get('amtPaid'),
                                //invoiceUrl: dt.Subscription.get('invoiceUrl'),
                                startDate: dt.Subscription.get('startDate'),
                                endDate: dt.Subscription.get('endDate'),
                            }, process.env.JWT_KEY, { expiresIn: secondsUntilExpiration }, async(err, token) => {
                                if (err) {
                                    //console.log("LINE(230)", err);
                                    res.status(500).json({ error: err.message });
                                } else {
                                    //console.log(token);
                                    res.setHeader('Access-Control-Allow-Origin', 'https://filmfair.vercel.app');
                                    res.cookie('FilmFairRefresh', token, {
                                        expires: expirationDate,
                                        httpOnly: false,
                                        secure: false,
                                        sameSite: 'Strict',
                                        domain: 'localhost',
                                        path: '/'
                                    });
                                    //res.json({jwt:token});
                                    res.status(200).json({ message:'User Exists && Active', userid: dt._id, jwt: token });
                                    //console.log('setCookie initiated');
                
                                    // const dtt = await userdb.findOne({ session_id: sesID });
                                    // if(dtt){
                                        dt.jwt= token;
                                        dt.Devices.push(req.body.usrfingerprint)
                                        await dt.save();
                                        //console.log(" JWT saved in DATABASE ")
                                    //}
                                }
                            });
                        } else{
                            //console.log("the user gave right credentials also plan active but usrfingerprint not in array (meaning user had loggedout, now trying to login) amtpaid by usr is 4900 but devices array is not full neiter has space ") 
                            }
                    }
                    else if(dt.Subscription.get('amtPaid') == 9900){
                        if(dt.Devices.length==4){
                            res.status(210).json({ message: "Device Limit Reached" });
                        } 
                        else if(dt.Devices.length<4){
                            jwt.sign({
                                userID: dt._id.toString(),
                                name: dt.UserNAME,
                                email: dt.UserEMAIL,
                                //sessionID: dt.session_id,
                                paymentStatus: dt.Subscription.get('paymentStatus'),
                                subsID: dt.Subscription.get('subscriptionID'),
                                amtPaid: dt.Subscription.get('amtPaid'),
                                //invoiceUrl: dt.Subscription.get('invoiceUrl'),
                                startDate: dt.Subscription.get('startDate'),
                                endDate: dt.Subscription.get('endDate'),
                            }, process.env.JWT_KEY, { expiresIn: secondsUntilExpiration }, async(err, token) => {
                                if (err) {
                                    //console.log("LINE(230)", err);
                                    res.status(500).json({ error: err.message });
                                } else {
                                    //console.log(token);
                                    res.setHeader('Access-Control-Allow-Origin', 'https://filmfair.vercel.app');
                                    res.cookie('FilmFairRefresh', token, {
                                        expires: expirationDate,
                                        httpOnly: false,
                                        secure: false,
                                        sameSite: 'Strict',
                                        domain: 'localhost',
                                        path: '/'
                                    });
                                    //res.json({jwt:token});
                                    res.status(200).json({ message:'User Exists && Active', userid: dt._id, jwt: token });
                                    //console.log('setCookie initiated');
                
                                    // const dtt = await userdb.findOne({ session_id: sesID });
                                    // if(dtt){
                                        dt.jwt= token;
                                        dt.Devices.push(req.body.usrfingerprint)
                                        await dt.save();
                                        //console.log(" JWT saved in DATABASE ")
                                    //}
                                }
                            });
                        } else{
                            //console.log("the user gave right credentials also plan active but usrfingerprint not in array (meaning user had loggedout, now trying to login) amtpaid by usr is 9900 but devices array is not full neiter has space ") 
                        }
                    }
                } else{
                    //console.log("Devices array me usrfingerprint hai bhi aur nhi bhi")
                }

                // 2) Users plan is active but logged out meaning Fingerprint not in db so check for limit

            }
            else if (daysDifference && daysDifference < 0) {
                //console.log('inside daysDifference && daysDifference < 0')
                const device = dt.Devices.some(fingerprint => fingerprint === req.body.usrfingerprint) //meaning subs exp also fingerprint in db meaning usr loggedin
                const length = dt.Devices.length
                //console.log(length)
                if(device){
                    res.status(201).json({ message:'User Exists && EXPIRED Subs=true', userid: dt._id }); // Subscription has expired
                } 
                else if(!device){
                    if(dt.Subscription.get('amtPaid')==900){
                        if(length==1){
                            res.status(210).json({ message: "Device Limit Reached" });
                        } else if(length<1){
                            res.status(201).json({ message:'User Exists && EXPIRED Subs=true', userid: dt._id });
                        }
                    }
                    else if (dt.Subscription.get('amtPaid') == 4900){
                        if(length==2){
                            res.status(210).json({ message: "Device Limit Reached" });
                        } else if(length<2){
                            res.status(201).json({ message:'User Exists && EXPIRED Subs=true', userid: dt._id });
                        }
                    }
                    else if(dt.Subscription.get('amtPaid')==9900){
                        if(length==4){
                            res.status(210).json({ message: "Device Limit Reached" });
                        } else if(length<4){
                            res.status(201).json({ message:'User Exists && EXPIRED Subs=true', userid: dt._id });
                        }
                    } else{
                        //console.log('unexpected, on line 475 server')
                    }
                }
            } 
            else { // New user or expired subscription
                //console.log('inside else 482')
                res.status(202).json({ message:'New User && Subs=true', userid: dt._id});
            }
        } 
        else { // User not found
            //console.log("User Not Found Line(183)")
            res.status(400).json({ message: "User Not Found" });
        }
    } catch (err) {
        res.status(404).send(err);
    }
});

app.post("/details", verifyToken, async(req, res)=>{
    const data = req.body;
    const user = req.user;
    try{
        const resp = await apidata.find({_id: data.id});
        if(resp){
            res.status(200).json({movie:resp, usr: user.userID});
        }
        else{
            res.status(400).json("Movie Doesnt Exist");
        }

    } catch(err){
        //console.log("Error on Line 196 in moviedetail server endpoint", err)
    }
})

app.patch('/updatereviewrating', async(req,res)=>{
    const data = req.body;
    //console.log(data);
    try{
        const updatedMovie= await apidata.findByIdAndUpdate(data.id, {
            $set: {
                [`reviews.${data.user}`]:data.usrreview,
                [`ratings.${data.user}`]:data.usrrating,
            }
        }, {new:true} )


        if (updatedMovie) {
            res.status(200).json("Updated Successfully");
        } else {
            res.status(404).json("Document not found");
          }

    } catch(err){
        res.send(err).status(404);
    }
})

app.post('/wishlistStatus', async (req, res) => {
    const userId = req.body.usrs;
    const movieId = req.body.id;
    //console.log(userId, movieId);
    try {
        const user = await userdb.findOne({ _id: userId });
        
        if (user && user.Wishlist.includes(movieId)) {
            res.status(200).json(true);
        } else {
            res.status(200).json(false);
        }
    } catch (err) {
        res.status(500).json("Error fetching wishlist status");
    }
});

app.patch('/wishlist', async (req, res) => {
    try {
        const dtt = await userdb.findOne({ _id: req.body.usrs });
        if (dtt && !dtt.Wishlist.some(item => item.id === req.body.id)) {
            // Check if any object in Wishlist array has the same id as req.body.id
            dtt.Wishlist.push(req.body.id);
            await dtt.save();
            res.status(200).json('Data added to wishlist');
        } else {
            res.status(200).json('Item already exists in the wishlist');
        }
    } catch (err) {
        console.error(err);
        res.status(500).json("Error updating wishlist");
    }
});


app.patch('/deletewish', async(req,res)=>{
    try{
        const dtt = await userdb.findOne({ _id: req.body.usrs });
        if(dtt){
            let index = dtt.Wishlist.indexOf(req.body.id);
            dtt.Wishlist.splice(index,1);
            await dtt.save();
            res.status(200).json('Data deleted from wishlist');
        } else{
            //console.log("user not found");
        }
    } catch(err){
        res.status(404).json("Error in deleting wishlist")
    }
})

app.post("/getuser", verifyToken, async(req, res)=>{
    const user = req.user;
    try{
        const dt = await userdb.findOne({ _id: user.userID });
        if(dt){
            console.log(dt)
            res.json(dt);
        }
        else{
            console.log("User Not Found line304");
        }
    }catch(e){
        console.log("Piyush Error on line 298",e)
    }
})




app.post('/striperetrieve', async(req,res)=>{
    const sesID = req.body.sessionID;
    const fingerprint = req.body.fingerpri;
    //console.log("Session ID received on /striperetrieve", sesID);

    try {
        let plan;
        const session = await stripe.checkout.sessions.retrieve(sesID);
        if(session.amount_total==900){
            plan="Basic";
        }
        else if(session.amount_total==4900){
            plan="Standard";
        }
        else if(session.amount_total==9900){
            plan="Premium";
        }
        //console.log("Reached Line237")
        //console.log(plan)
        //console.log(session.payment_status)
        res.json({subscription: plan, status: session.payment_status })
        
        if(session.payment_status=='paid'){
            const dt = await userdb.findOneAndUpdate(
                { session_id: sesID },
                {$push: { Devices: fingerprint }},
                { returnOriginal: false }
            );
        }
    }
    catch(err){
        res.json("error on line 189 in server", err)
        //console.log("Error aaya PIYUSH LINE(203)", err);
    }
})


app.post('/generatejwt', async (req, res) => {
    const sesID = req.body.sessionID;
    try {
        const dt = await userdb.findOne({ session_id: sesID });
        if (dt) {
            const endDateString = dt.Subscription.get('endDate');
            const endDate = new Date(endDateString);
            const today = new Date();
            const differenceInMs = endDate - today;
            const millisecondsInADay = 1000 * 60 * 60 * 24;
            let daysRemaining = Math.ceil(Math.abs(differenceInMs) / millisecondsInADay); // Convert milliseconds to days and round up
            //daysRemaining = daysRemaining+1;
            //console.log(daysRemaining)
            
            jwt.sign({
                userID: dt._id.toString(),
                name: dt.UserNAME,
                email: dt.UserEMAIL,
                //sessionID: dt.session_id,
                paymentStatus: dt.Subscription.get('paymentStatus'),
                subsID: dt.Subscription.get('subscriptionID'),
                amtPaid: dt.Subscription.get('amtPaid'),
                //invoiceUrl: dt.Subscription.get('invoiceUrl'),
                startDate: dt.Subscription.get('startDate'),
                endDate: dt.Subscription.get('endDate'),
            }, process.env.JWT_KEY, { expiresIn: `${daysRemaining}d` }, async(err, token) => {
                if (err) {
                    //console.log("LINE(184)", err);
                    res.status(500).json({ error: err.message });
                } else {
                    //console.log(token);
                    res.setHeader('Access-Control-Allow-Origin', 'https://filmfair.vercel.app');
                    res.cookie('FilmFairRefresh', token, {
                        maxAge: daysRemaining * 24 * 60 * 60 * 1000,
                        httpOnly: false,
                        secure: false,
                        sameSite: 'Strict',
                        domain: 'localhost',
                        path: '/'
                    });
                    res.json({jwt:token});
                    //console.log('setCookie initiated');

                    // const dtt = await userdb.findOne({ session_id: sesID });
                    // if(dtt){
                        dt.jwt= token;
                        await dt.save();
                        //console.log(" JWT saved in DATABASE ")
                    //}
                }
            });
        }
    } catch (err) {
        //console.log("LINE(203) ", err);
        res.status(500).json({ error: err.message });
    }
});
////////EVERYTHING WORKING PERFECTLY, JWT IS BEING GENERATED, THWN STORED IN COOKIE AND VISIBLE ON CLIENTS BROWSER ALSO SAVED IN DATABASE/////


app.post('/checkout', async(req, res) => {
    const user = req.body;
    try {
        //console.log("new request-------------------------------------------------------------------->")
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
                {
                    price: user.plan_id,
                    quantity: 1,
                },
            ],
            mode: 'subscription',
            success_url: `https://filmfair.vercel.app/`,
            cancel_url: `https://filmfair.vercel.app/`,
        });
        const dt = await userdb.findOne({_id: user.usr_id})
            if(dt){
                dt.session_id= session.id;
                await dt.save();
                //console.log("Session ID saved in DATABASE")
            } else{
                //console.log(" USER NOT FOUND ") 
                }
        res.json({ url: session.url, sesid: session.id });

    } catch (err) {
        //console.log(err);
        res.status(500).json({ error: 'An error occurred' });
    }
});




app.get("/api", async(req,res)=>{
    try{
        const { genre } = req.query;
        const {search} = req.query;
        const {cat} = req.query;
        const {catver} = req.query;
        const {param} = req.query;
        if(genre){
            const lowercase = genre.toLowerCase();
            const resp = await apidata.find({});
            const moviesTitles = resp.filter(item => item.genre.map(ele=> ele.toLowerCase()).includes(lowercase));
            res.json(moviesTitles);
        }
        else if(search){
            const lowercase = search.toLowerCase();
            const resp = await apidata.find({});
            const moviesTitles = resp.filter(item => item.movies_title.toLowerCase().includes(lowercase));
            res.json(moviesTitles);
        }
        else if(cat){
            const lowercase = cat.toLowerCase();
            const resp = await apidata.find({});
            const moviesTitles = resp.filter(item => item.cat.toLowerCase().includes(lowercase));
            const posters = moviesTitles.map(item => ({ _id: item._id, poster: item.poster }));
            res.json(posters);
        }
        else if(catver){
            const lowercase = catver.toLowerCase();
            const resp = await apidata.find({});
            const moviesTitles = resp.filter(item => item.cat.toLowerCase().includes(lowercase));
            const posters = moviesTitles.map(item => ({ _id: item._id, ver_poster: item.ver_poster }));
            res.json(posters);
        }
        else if(param){
            const resp = await apidata.find({});
            res.json(resp);
        }
        else {
            const resp = await apidata.find({});
            res.json(resp);
        }
    } catch(e){
        //console.log("error");
        res.status(404).send(e);
    }
})


app.post('/customer-portal', async(req, res) => {
    const {custID} = req.body;
    try{
        const session = await stripe.billingPortal.sessions.create({
            customer: custID,
            return_url: 'https://filmfair.vercel.app/profile',
          });
          //console.log(session);
          res.json({sesID: session.id, url: session.url});
    } catch(e){
        //console.log(e);
        res.status(500).json({ error: 'An error occurred line 517' });
    }
})

app.post('/verifyjwt', verifyToken,async(req,res)=>{
    res.status(200).json("Token is valid::/verifyjwt"); // will send this response only when the token is verified i.e the middleware calls next()
})

app.post('/logoutuser', async(req,res)=>{
    const dt = await userdb.findOneAndUpdate(
        { _id: req.body.id },
        {$pull: { Devices: req.body.fingerprint }},
        { new: true }
    );
})

app.post('/verifyfingerprint', async(req,res)=>{
    const dt = await userdb.findOne({ _id: req.body.id })
    if(dt){
        const fingerprintexists = dt.Devices.includes(req.body.visitorId)
        if(fingerprintexists){
            res.status(200).json("user logged in")
        } else if(!fingerprintexists){
            res.status(400).json("user not logged in");
        }
    } else{
        //console.log('User not found /verifyfingerprint')
    }
})



app.listen(port, ()=>{
    //console.log(`Server running successfully on port no. ${port}`);
})