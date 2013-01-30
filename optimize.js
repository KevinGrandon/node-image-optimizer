var fs = require('fs')
var http = require('http')
var path = require('path')
var url = require('url')

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
      var fullPath = currDirectory + file
      var fileStat = fs.statSync(fullPath)

      if (!history.files[fullPath] || history.files[fullPath] != fileStat.size) {
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

    function gotResponse(data) {
      data = JSON.parse(data)
      console.log('GOT RESPONSE:', data)

      // If there is no destination, the image is optimized fully
      if (!data.dest) {
        smush()
        return
      }
      
      // Update history
      history.files[currFile[0] + currFile[1]] = data.dest_size

      var urlParts = url.parse(data.dest)

      var request = http.get({
        host: urlParts.host,
        path: urlParts.pathname
      }, function(res){

        var imagedata = ''
        res.setEncoding('binary')
  
        res.on('data', function(chunk){
            imagedata += chunk
        })
  
        res.on('end', function(){
          fs.writeFile(currFile[0] + currFile[1], imagedata, 'binary', function(err){
            if (err) console.log(err)
            smush()
          })
        })
      })
    }
  }
    
  smush()
}

function done() {

  // Write history
  var historyString = JSON.stringify(history)
  fs.writeFileSync(__dirname + '/history.json', historyString, 'utf-8')
  console.log('NEW HISTORY:', historyString)

  console.log('------------------------------------')
  console.log('Image optimization complete.')
}