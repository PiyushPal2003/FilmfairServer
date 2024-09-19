const mongoose = require("mongoose");

const api = new mongoose.Schema({
    movies_title : {
        type: String,
        required:true
    },
    desc: {
        type:String,
        required:true,
    },
    year:{
        type:String,
        required:true,
    },
    rating:{
        type: Number,
        required:true,
    },
    poster:{
        type:String,
        required:true,
    },
    reviews:{
        type:Map,
        of: String,
    },
    ratings:{
        type:Map,
        of: String,
    },
    genre: {
        type: [String],
        required: true,
    },
    cat:{
        type:String,
        required: true,
    }
})

const apidata = new mongoose.model("api", api);

module.exports = apidata;