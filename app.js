const CLIENT_STATIC_PATH = '../ImageTagger/dist';
const IMAGE_FORMAT = '.png';
const CLARIFAI_API_KEY = 'aad69e3b420e4b1bbec50e545566b34f';
const IMAGE_DIR = './uploads/';
const IMAGE_TAGGER_DIR = './uploads/tagger/';
const IMAGE_TAGGER_RAW_DIR = './uploads/tagger/raw/';
const IMAGE_TAGGER_RESIZED_DIR = './uploads/tagger/resized/';
const IMAGE_TAGGER_RECORD_FILE = './uploads/tagger/record.json';
const IMAGE_FACE_DIR = './uploads/face/';
const IMAGE_FACE_RAW_DIR = './uploads/face/raw/';
const IMAGE_FACE_RESIZED_DIR = './uploads/face/resized/';
const IMAGE_FACE_RECORD_FILE = './uploads/face/record.json';
const IMAGE_HEIGHT = 300;

const ROUTE = {
  POST: {
    IMAGE: {
      TAGGER: 'image/tagger/',
      FACE: 'image/face/',
    },
  },
  GET: {
    IMAGES: {
      TAGGER: 'images/tagger/',
      FACE: 'images/face/',
    },
    RECORDS: {
      TAGGER: 'records/tagger/',
      FACE: 'records/face/',
    },
  },
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

const app = express();

const clarifaiAgent = new Clarifai.App({
  apiKey: CLARIFAI_API_KEY
});

let taggerImageRecords = [];
let faceImageRecords = [];
let isCleanTaggerRecordsNeeded = false;
let isCleanFaceRecordsNeeded = false;

if (!fs.existsSync(IMAGE_DIR)) {
  fs.mkdirSync(IMAGE_DIR);
} else {
  if (!fs.existsSync(IMAGE_TAGGER_DIR)) {
    fs.mkdirSync(IMAGE_TAGGER_DIR);
  } else {
    if (!fs.existsSync(IMAGE_TAGGER_RAW_DIR)) {
      fs.mkdirSync(IMAGE_TAGGER_RAW_DIR);
      isCleanTaggerRecordsNeeded = true;
    }
    if (!fs.existsSync(IMAGE_TAGGER_RESIZED_DIR)) {
      fs.mkdirSync(IMAGE_TAGGER_RESIZED_DIR);
      isCleanTaggerRecordsNeeded = true;
    }
    if (isCleanTaggerRecordsNeeded && fs.existsSync(IMAGE_TAGGER_RECORD_FILE)) {
      fs.unlinkSync(IMAGE_TAGGER_RECORD_FILE);
    } else if (fs.existsSync(IMAGE_TAGGER_RECORD_FILE)) {
      taggerImageRecords = loadImageRecords(IMAGE_TAGGER_RECORD_FILE);
    }
  }

  if (!fs.existsSync(IMAGE_FACE_DIR)) {
    fs.mkdirSync(IMAGE_FACE_DIR);
  } else {
    if (!fs.existsSync(IMAGE_FACE_RAW_DIR)) {
      fs.mkdirSync(IMAGE_FACE_RAW_DIR);
      isCleanFaceRecordsNeeded = true;
    }
    if (!fs.existsSync(IMAGE_FACE_RESIZED_DIR)) {
      fs.mkdirSync(IMAGE_FACE_RESIZED_DIR);
      isCleanFaceRecordsNeeded = true;
    }
    if (isCleanFaceRecordsNeeded && fs.existsSync(IMAGE_FACE_RECORD_FILE)) {
      fs.unlinkSync(IMAGE_FACE_RECORD_FILE);
    } else if (fs.existsSync(IMAGE_FACE_RECORD_FILE)) {
      faceImageRecords = loadImageRecords(IMAGE_FACE_RECORD_FILE);
    }
  }
}


app.use(cors());
app.use(bodyParser.json({limit: '15mb'}));
app.use('/', express.static(CLIENT_STATIC_PATH));
app.use('/' + ROUTE.GET.IMAGES.TAGGER, express.static('uploads/tagger/resized'));
app.use('/' + ROUTE.GET.IMAGES.FACE, express.static('uploads/face/resized'));

app.post('/' + ROUTE.POST.IMAGE.TAGGER, (req, res) => {
  handleImageUpload(req, res, true);
});
app.post('/' + ROUTE.POST.IMAGE.FACE, (req, res) => {
  handleImageUpload(req, res, false);
});

app.get('/' + ROUTE.GET.RECORDS.TAGGER, (req, res) => {
  res.status(STATUS_CODE.OK).end(JSON.stringify({records: taggerImageRecords}));
});
app.get('/' + ROUTE.GET.RECORDS.FACE, (req, res) => {
  res.status(STATUS_CODE.OK).end(JSON.stringify({records: faceImageRecords}));
});

app.listen(3000, () => console.log('Server app listening on port 3000!'));

function handleImageUpload(req, res, isTagger) {
  const base64Data = req.body.base64Url.replace(/^data:image\/png;base64,/, "").replace(/^data:image\/jpeg;base64,/, "");
  const resizedName = req.body.name.substr(0,req.body.name.lastIndexOf('.')) + IMAGE_FORMAT;
  const resizedPath = (isTagger ? IMAGE_TAGGER_RESIZED_DIR : IMAGE_FACE_RESIZED_DIR) + resizedName;
  console.log("Image uploaded: " + req.body.name);
  fs.writeFileSync((isTagger ? IMAGE_TAGGER_RAW_DIR : IMAGE_FACE_RAW_DIR) + req.body.name, base64Data, 'base64', function(err) {
    console.error(err);
    res.status(STATUS_CODE.SERVER_ERROR).end(JSON.stringify({}));
  });
  sharp((isTagger ? IMAGE_TAGGER_RAW_DIR : IMAGE_FACE_RAW_DIR) + req.body.name)
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
          updateTaggerImageRecords(resizedName, concepts);
        });
      }
    });
}

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

function updateTaggerImageRecords(name, concepts) {
  const newRecord = {
    name,
    concepts,
  };
  let isFound = false;
  taggerImageRecords.forEach((record) => {
    if (record.name === newRecord.name) {
      record.concepts = newRecord.concepts;
      isFound = true;
    }
  });
  if (!isFound) {
    taggerImageRecords.push(newRecord);
  }
  fs.writeFileSync(IMAGE_TAGGER_RECORD_FILE, JSON.stringify(taggerImageRecords, null, 2));
}