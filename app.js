const CLIENT_STATIC_PATH = '../ImageTagger/dist';
const IMAGE_FORMAT = '.png';
const IMAGE_HEIGHT = 300;
const IMAGE_DIR = './uploads/';
const IMAGE_TAGGER_DIR = './uploads/tagger/';
const IMAGE_TAGGER_RAW_DIR = './uploads/tagger/raw/';
const IMAGE_TAGGER_RESIZED_DIR = './uploads/tagger/resized/';
const IMAGE_TAGGER_RECORD_FILE = './uploads/tagger/record.json';
const IMAGE_FACE_DIR = './uploads/face/';
const IMAGE_FACE_RAW_DIR = './uploads/face/raw/';
const IMAGE_FACE_RESIZED_DIR = './uploads/face/resized/';
const IMAGE_FACE_RECORD_FILE = './uploads/face/record.json';
const API_URL = {
  AZURE: {
    FACE_DETECT: 'https://westcentralus.api.cognitive.microsoft.com/face/v1.0/detect/',
  },
};
const API_KEY = {
  AZURE: {
    FACE_DETECT: [
      'f2810df90a854650bd4a7d148f708198',
      'b7c2af713a8b4b4f816532ee2facff11',
    ],
  },
  CLARIFAI: 'aad69e3b420e4b1bbec50e545566b34f',
};
const FACE_DETECT_PARAMS = {
  returnFaceId: true,
  returnFaceLandmarks: false,
  returnFaceAttributes: 'age,gender,smile,glasses,emotion,hair,makeup',
}

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
const fetch = require('node-fetch');
const queryString = require('query-string');

const app = express();

const clarifaiAgent = new Clarifai.App({
  apiKey: API_KEY.CLARIFAI
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
        if (isTagger) {
          predictConcepts(resizedPath, (concepts) => {
            res.status(STATUS_CODE.ACCEPTED).end(JSON.stringify({concepts}));
            updateTaggerImageRecords(resizedName, concepts);
          });
        }
        else {
          faceIdent(resizedPath, (result) => {
            res.status(STATUS_CODE.ACCEPTED).end(JSON.stringify({result}));
            updateFaceImageRecords(resizedName, result);
          });
        }
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
  });
}

function faceIdent(imagePath, callback) {
  toBinaryString(imagePath, (binString) => {
    const url = API_URL.AZURE.FACE_DETECT + '?' + queryString.stringify(FACE_DETECT_PARAMS);
    console.log(url);
    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Ocp-Apim-Subscription-Key': randomChoice(API_KEY.AZURE.FACE_DETECT),
      },
      qs: FACE_DETECT_PARAMS,
      body: binString,
    }).then(res => res.json())
      .then((resJson) => {
        console.log(resJson);
        callback(resJson);
      })
      .catch((err) => {
        console.error(err);
      });
  });
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

function toBinaryString(path, callback) {
  const reader = new fileApi.FileReader();
  reader.addEventListener('load', function (ev) {
    const binString = ev.target.result;
    callback(binString);
  });
  reader.readAsArrayBuffer(new fileApi.File(path));
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

function updateFaceImageRecords(name, result) {
  const newRecord = {
    name,
    result,
  };
  let isFound = false;
  faceImageRecords.forEach((record) => {
    if (record.name === newRecord.name) {
      record.result = newRecord.result;
      isFound = true;
    }
  });
  if (!isFound) {
    faceImageRecords.push(newRecord);
  }
  fs.writeFileSync(IMAGE_FACE_RECORD_FILE, JSON.stringify(faceImageRecords, null, 2));
}

function randomChoice(arr) {
  return arr[Math.floor(arr.length * Math.random())];
}