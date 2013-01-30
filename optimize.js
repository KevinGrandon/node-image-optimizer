var fs = require('fs')
var http = require('http')
var path = require('path')

console.log('Beginning to optimize images...')

var config = require(__dirname + '/config.js')

var history = JSON.parse(fs.readFileSync(__dirname + '/history.json', 'utf-8'))

var allFiles = []

/**
 * Gets all files located in the config.imageFolders directories
 */
function getAllFiles() {
  if (!config.imageFolders.length) {
    processAllFiles()
    return
  }

  var currDirectory = config.baseFolder + config.imageFolders.shift()

  fs.readdir(currDirectory, function(err, files) {
    if (err) {
      console.log(err)
      return
    }

    files.forEach(function(file) {
      var fileStat = fs.statSync(currDirectory + file)

      if (!history.files[file] || history.files[file] != fileStat.size) {
        allFiles.push([currDirectory, file, fileStat.size])
      }
    })

    console.log('Got ' + allFiles.length + ' files.')

    getAllFiles()
  })
}
getAllFiles()

/**
 * Smushes all files
 * - Sends the file to smushit
 * - Overwrites the local file
 */
function processAllFiles() {
  console.log('Smushing ' + allFiles.length + ' files.')

  function smush() {
    if (!allFiles.length) {
      done()
      return
    }

    var currFile = allFiles.shift()

    function getMimeType() {
      var mimeTypes = {
        "jpeg": "image/jpeg",
        "jpg": "image/jpeg",
        "png": "image/png",
        "gif": "image/gif"
      }
      var mimeType = mimeTypes[path.extname(currFile[1]).split(".")[1]]
      return mimeType
    }
    
    var boundaryKey = Math.random().toString(16); // random string

    // the header for the one and only part (need to use CRLF here)
    var clrf = "\r\n"
    var fileData = fs.readFileSync(currFile[0] + currFile[1])

    var multipartHeader = clrf + '--' + boundaryKey + clrf +
      // use your file's mime type here, if known
      'Content-Type: application/' + getMimeType() + clrf +
      // "name" is the name of the form field
      // "filename" is the name of the original file
      'Content-Disposition: form-data; name="files"; filename="' + currFile[1] + '"' + clrf + clrf

    var multipartFooter = clrf + '--' + boundaryKey + '--'

    var multipartBody = Buffer.concat([
      new Buffer(multipartHeader),
      //formFields,
      fileData,
      new Buffer(multipartFooter)
    ])

    var request = new http.request({
      hostname: 'ypoweb-01.experf.gq1.yahoo.com',
      path: '/ysmush.it/ws.php',
      method: "POST",
      headers: {
        "Content-Type": 'multipart/form-data; boundary="' + boundaryKey + '"',
        "Content-Length": multipartBody.length
      }
    })
    
    var responseData = ''
    request.on('response', function (response) {
      response.on('data', function (chunk) {
        responseData += chunk
      })
      response.on('end', function () {
        gotResponse(responseData)
      })
    })

    request.write(multipartBody)
    request.end()

    /*
    fs.createReadStream(currFile[0] + currFile[1], { bufferSize: 4 * 1024 })
      .on('end', function() {
        // mark the end of the one and only part
        request.end(multipartFooter) 
      })
      // set "end" to false in the options so .end() isn't called on the request
      .pipe(request, { end: false })
    */ 

    function gotResponse(data) {
      console.log('GOT RESPONSE:', data)
      smush()
    }
  }
    
  smush()
}

function done() {
  console.log('------------------------------------')
  console.log('Image optimization complete.')
}