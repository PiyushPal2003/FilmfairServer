const mongoose = require("mongoose");

const user_details = new mongoose.Schema({
    UserNAME : {
        type: String,
        required:true
    },
    UserEMAIL:{
        type:String,
        required:true,
        unique: true,
    },
    UserPASS: {
        type: String,
        required: true,
    },
    Wishlist: {
        type: Array,
        required :true,
        unique: true,
    },
    Devices: {
        type: Array,
        required :true,
    },
    session_id: {
        type: String,
    },
    jwt:{
        type: String,
    },
    Subscription: {
        type:Map,
        of: String,
        default: {}
    }
    // Subscription: {
    //     cust_email: {
    //         type: String
    //     },
    //     cust_name: {
    //         type: String
    //     },
    //     amtPaid: {
    //         type: String
    //     },
    //     subscriptionID: {
    //         type: String
    //     },
    //     paymentStatus: {
    //         type: String
    //     },
    //     invoiceUrl:{
    //         type: String
    //     },
    //     startDate: {
    //         type:String
    //     },
    //     endDate: {
    //         type:String
    //     }
    // }
});

const userdb = mongoose.model("user_detail", user_details);

module.exports = userdb;
