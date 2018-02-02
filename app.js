const IMAGE_FORMAT = '.png';
const CLARIFAI_API_KEY = 'aad69e3b420e4b1bbec50e545566b34f';
const IMAGE_DIR = './uploads/'
const IMAGE_RAW_DIR = './uploads/raw/';
const IMAGE_RESIZED_DIR = './uploads/resized/';
const IMAGE_HEIGHT = 300;
const IMAGE_RECORD_FILE = './uploads/record.json';
const ROUTE = {
  POST: {
    IMAGE: 'image/',
  },
  GET: {
    IMAGES: 'images/',
    RECORDS: 'records/'
  }
};
const STATUS_CODE = {
  OK: 200,
  ACCEPTED: 202,
  SERVER_ERROR: 500,
};

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const sharp = require('sharp');
const clarifai = require('clarifai');
const fileApi = require('file-api');
const io = require('socket.io')();

const app = express();

const clarifaiAgent = new Clarifai.App({
  apiKey: CLARIFAI_API_KEY
});

let imageRecords = [];
let isCleanRecordsNeeded = false;

if (!fs.existsSync(IMAGE_DIR)) {
  fs.mkdirSync(IMAGE_DIR);
  isCleanRecordsNeeded = true;
}
if (!fs.existsSync(IMAGE_RAW_DIR)) {
  fs.mkdirSync(IMAGE_RAW_DIR);
  isCleanRecordsNeeded = true;
}
if (!fs.existsSync(IMAGE_RESIZED_DIR)) {
  fs.mkdirSync(IMAGE_RESIZED_DIR);
  isCleanRecordsNeeded = true;
}
if (isCleanRecordsNeeded && fs.existsSync(IMAGE_RECORD_FILE)) {
  fs.unlinkSync(IMAGE_RECORD_FILE);
} else if (fs.existsSync(IMAGE_RECORD_FILE)) {
  imageRecords = loadImageRecords(IMAGE_RECORD_FILE);
}

app.use(cors());
app.use(bodyParser.json({limit: '10mb'}));
app.use('/' + ROUTE.GET.IMAGES, express.static('uploads/resized'));

app.post('/' + ROUTE.POST.IMAGE, (req, res) => {
  const base64Data = req.body.base64Url.replace(/^data:image\/png;base64,/, "").replace(/^data:image\/jpeg;base64,/, "");
  const resizedName = req.body.name.substr(0,req.body.name.lastIndexOf('.')) + IMAGE_FORMAT;
  const resizedPath = IMAGE_RESIZED_DIR + resizedName;
  console.log("Image uploaded: " + req.body.name);
  fs.writeFileSync(IMAGE_RAW_DIR + req.body.name, base64Data, 'base64', function(err) {
    console.error(err);
    res.status(STATUS_CODE.SERVER_ERROR).end(JSON.stringify({}));
  });
  sharp(IMAGE_RAW_DIR + req.body.name)
    .resize(null, IMAGE_HEIGHT)
    .png()
    .toFile(resizedPath, (err, info) => {
      if (err) {
        console.log(err);
        res.status(STATUS_CODE.SERVER_ERROR).end(JSON.stringify({}));
      } else if (info) {
        console.log(info);
        predictConcepts(resizedPath, (concepts) => {
          res.status(STATUS_CODE.ACCEPTED).end(JSON.stringify({concepts}));
          updateImageRecords(resizedName, concepts);
        });
      }
    });
});

app.get('/' + ROUTE.GET.RECORDS, (req, res) => {
  res.status(STATUS_CODE.OK).end(JSON.stringify({records: imageRecords}));
});

app.listen(3000, () => console.log('Server app listening on port 3000!'));

function predictConcepts(imagePath, callback) {
  toDataURL(imagePath, (dataUrl) => {
    // console.log(dataUrl)
    clarifaiAgent.models.predict(Clarifai.GENERAL_MODEL, dataUrl).then(
      function(response) {
        // console.log('Resp');
        console.log(JSON.stringify(response.outputs[0].data.concepts.map(item => item.name)));
        callback(response.outputs[0].data.concepts);
      },
      function(err) {
        console.log('Error');
        // console.error(err);
      }
    );
  })
}

function toDataURL(path, callback) {
  const reader = new fileApi.FileReader();
  reader.addEventListener('load', function (ev) {
    console.log("dataUrlSize:", ev.target.result.length);
    const base64Data = ev.target.result.replace(/^data:image\/png;base64,/, "").replace(/^data:image\/jpeg;base64,/, "");
    callback(base64Data);
  });
  reader.readAsDataURL(new fileApi.File(path));
}

function loadImageRecords(path) {
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

function updateImageRecords(name, concepts) {
  const newRecord = {
    name,
    concepts,
  };
  let isFound = false;
  imageRecords.forEach((record) => {
    if (record.name === newRecord.name) {
      record.concepts = newRecord.concepts;
      isFound = true;
    }
  });
  if (!isFound) {
    imageRecords.push(newRecord);
  }
  fs.writeFileSync(IMAGE_RECORD_FILE, JSON.stringify(imageRecords, null, 2));
}