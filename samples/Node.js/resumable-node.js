var fs = require('fs'), path = require('path');

module.exports = resumable = function(temporaryFolder){
  var $ = this;
  $.temporaryFolder = temporaryFolder;
  $.maxFileSize = null;
  $.fileParameterName = 'file';

  try {
    fs.mkdirSync($.temporaryFolder);
  }catch(e){}


  var cleanIdentifier = function(identifier){
    return identifier.replace(/^0-9A-Za-z_-/img, '');
  }

  var getChunkFilename = function(chunkNumber, identifier){
    // Clean up the identifier
    identifier = cleanIdentifier(identifier);
    // What would the file name be?
    return path.join($.temporaryFolder, './resumable-'+identifier+'.'+chunkNumber);
  }

  var validateRequest = function(chunkNumber, chunkSize, totalSize, identifier, filename, fileSize){    
    // Clean up the identifier
    identifier = cleanIdentifier(identifier);

    // Check if the request is sane
    if (chunkNumber==0 || chunkSize==0 || totalSize==0 || identifier.length==0 || filename.length==0) {
      return 'non_resumable_request';
    }
    var numberOfChunks = Math.max(Math.floor(totalSize/(chunkSize*1.0)), 1);
    if (chunkNumber>numberOfChunks) {
      return 'invalid_resumable_request1';
    }

    // Is the file too big?
    if($.maxFileSize && totalSize>$.maxFileSize) {
      return 'invalid_resumable_request2'; 
    }

    if(typeof(fileSize)!='undefined') {
      if(chunkNumber<numberOfChunks && fileSize!=chunkSize) {
        // The chunk in the POST request isn't the correct size
        return 'invalid_resumable_request3'; 
      } 
      if(numberOfChunks>1 && chunkNumber==numberOfChunks && fileSize!=((totalSize%chunkSize)+chunkSize)) {
        // The chunks in the POST is the last one, and the fil is not the correct size
        return 'invalid_resumable_request4'; 
      }
      if(numberOfChunks==1 && fileSize!=totalSize) {
        // The file is only a single chunk, and the data size does not fit
        return 'invalid_resumable_request5'; 
      }
    }

    return 'valid';
  }
  
  //'found', filename, original_filename, identifier
  //'not_found', null, null, null
  $.get = function(req, callback){
    var chunkNumber = req.param('resumableChunkNumber', 0);
    var chunkSize = req.param('resumableChunkSize', 0);
    var totalSize = req.param('resumableTotalSize', 0);
    var identifier = req.param('resumableIdentifier', "");
    var filename = req.param('resumableFilename', "");

    if(validateRequest(chunkNumber, chunkSize, totalSize, identifier, filename)=='valid') {
      var chunkFilename = getChunkFilename(chunkNumber, identifier);
      path.exists(chunkFilename, function(exists){
          if(exists){
            callback('found', chunkFilename, filename, identifier);
          } else {
            callback('not_found', null, null, null);
          }
        });
    } else {
      callback('not_found', null, null, null);
    }
  }

  //'partly_done', filename, original_filename, identifier
  //'done', filename, original_filename, identifier
  //'invalid_resumable_request', null, null, null
  //'non_resumable_request', null, null, null
  $.post = function(req, callback){
    req.form.complete(function(err, fields, files){
        var chunkNumber = fields['resumableChunkNumber'];
        var chunkSize = fields['resumableChunkSize'];
        var totalSize = fields['resumableTotalSize'];
        var identifier = cleanIdentifier(fields['resumableIdentifier']);
        var filename = fields['resumableFilename'];

        if(!files[$.fileParameterName] || !files[$.fileParameterName].size) {
          callback('invalid_resumable_request', null, null, null);
          return;
        }
        var validation = validateRequest(chunkNumber, chunkSize, totalSize, identifier, files[$.fileParameterName].size);
        if(validation=='valid') {
          var chunkFilename = getChunkFilename(chunkNumber, identifier);

          // Save the chunk (TODO: OVERWRITE)
          fs.rename(files[$.fileParameterName].path, chunkFilename, function(){

              // Do we have all the chunks?
              var currentTestChunk = 1;
              var numberOfChunks = Math.max(Math.floor(totalSize/(chunkSize*1.0)), 1);
              var testChunkExists = function(){
                path.exists(getChunkFilename(currentTestChunk, identifier), function(exists){
                    if(exists){
                      currentTestChunk++;
                      if(currentTestChunk>numberOfChunks) {
                        callback('done', null, null, null);
                      } else {
                        // Recursion
                        testChunkExists();
                      }
                    } else {
                      callback('partly_done', null, null, null);
                    }
                  });
              }
              testChunkExists();
            });
        } else {
          callback(validation, null, null, null);
        }
      });
  }

  return $;
}
