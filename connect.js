const mongoose = require("mongoose");
require('dotenv').config({ path: '.env' });

mongoose.connect(process.env.MONGODB_URL, {
    useNewUrlParser:true,
    useUnifiedTopology:true,
}).then(()=>{
    console.log("Connection Successfull");
}).catch((err)=>{
    console.log(err);
})