const AWS = require('aws-sdk');
const s3 = new AWS.S3();
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const fsp = require('fs').promises;
const endpoint = 'https://apidemo.infotalkcloud.com/';

let response;

/**
 *
 * Event doc: https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html#api-gateway-simple-proxy-for-lambda-input-format
 * @param {Object} event - API Gateway Lambda Proxy Input Format
 *
 * Context doc: https://docs.aws.amazon.com/lambda/latest/dg/nodejs-prog-model-context.html 
 * @param {Object} context
 *
 * Return doc: https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html
 * @returns {Object} object - API Gateway Lambda Proxy Output Format
 * 
 */
exports.lambdaHandler = async (event, context) => {

    try {
        const body = JSON.parse(event.body);
        console.log("****** body: " + JSON.stringify(body));

        const action = body.action;
        let resp;
        let returnBody;

        if (action && action == 'submit') {
            const bucket = body.bucket;
            const fileKey = body.key;
            const langCode = body.lang;
            const params = { Bucket: bucket, Key: fileKey };
            const formData = new FormData();
            const configJson = {
                'language': langCode,
                'model': 'default'
            }
            formData.append('audio', s3.getObject(params).createReadStream(), fileKey);
            formData.append('config', JSON.stringify(configJson));

            resp = await axios({
                method: 'post',
                url: endpoint + 'stt/offlinerecognize',
                data: formData,
                maxContentLength: Infinity,
                maxBodyLength: Infinity,
                headers: {
                    'content-type': `multipart/form-data; boundary=${formData._boundary}`,
                },
            });

            returnBody = resp.data;

            // For non submit action => poll job action
        } else {
            const jobId = body.jobId;
            const s3Bucket = body.s3Bucket;
            const s3Prefix = body.s3Prefix;

            resp = await axios({
                method: 'get',
                url: endpoint + 'jobs/' + jobId
            });

            const txb = {};
            txb.jobName = jobId;
            if (resp.status == 200 && resp.data.status == 'finished') {
                console.log("****** infotalk raw data: " + JSON.stringify(resp.data));
                txb.status = 'COMPLETED';

                txb.results = {};
                txb.results.transcripts = [];
                txb.results.items = [];

                const transcription = resp.data.results
                    .map(item => item.transcript)
                    .join('');

                txb.results.transcripts[0] = { transcript: transcription };

                let tempArray = [];
                resp.data.results.forEach(e => (tempArray = tempArray.concat(e.words)));

                tempArray.forEach(e => (
                    txb.results.items.push({
                        start_time: '' + e.startTime,
                        end_time: '' + e.endTime,
                        type: 'pronunciation',
                        alternatives: [
                            {
                                confidence: '1.0',
                                content: e.word
                            }
                        ]
                    })
                ));

                // Peter - write json result to s3
                if (s3Prefix && s3Bucket) {
                    console.log('try to write file...');
                    const myFileName = jobId + '.json';

                    await fsp.writeFile('/tmp/' + myFileName, JSON.stringify(txb));
                    console.log('Write ' + myFileName + ' to local.');
                    const uploadResult = await uploadToS3(s3Bucket, s3Prefix, myFileName);
                    txb.TranscriptFileUri = uploadResult.Location;
                    console.log('Write ' + myFileName + ' to s3.');
                }

            } else {
                txb.status = 'IN_PROGRESS';      // FAILED or QUEUED
            }

            returnBody = txb;
        }

        console.log("****** infotalk status: " + resp.status);
        //console.log("****** infotalk finalized data: " + JSON.stringify(returnBody));

        response = {
            'statusCode': resp.status,
            'body': JSON.stringify(returnBody)
        }

    } catch (err) {
        console.log(err);
        return err;
    }

    return response;
};

async function uploadToS3(bucket, prefix, fileName){
    const readStream = fs.createReadStream('/tmp/' + fileName);

    const params = {
        Bucket: bucket,
        Key: prefix + '/' + fileName,
        Body: readStream,
        ACL:'public-read'
    };

    return new Promise((resolve, reject) => {
        s3.upload(params, function (err, data) {
            readStream.destroy();

            if (err) {
                return reject(err);
            }

            return resolve(data);
        });
    });
}