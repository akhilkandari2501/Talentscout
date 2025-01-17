/* eslint-disable no-restricted-syntax */

import {CognitoIdentityClient} from '@aws-sdk/client-cognito-identity';
import {fromCognitoIdentityPool} from '@aws-sdk/credential-provider-cognito-identity';
import {
  TranscribeStreamingClient,
  StartStreamTranscriptionCommand,
} from '@aws-sdk/client-transcribe-streaming';
import MicrophoneStream from 'microphone-stream';
import {Buffer} from 'buffer';
import * as awsID from '../demo-credentials.js';

window.Buffer = Buffer;

const SAMPLE_RATE = 44100;
let microphoneStream;
let transcribeClient;

export const startRecording = async (language, callback) => {
  if (!language) {
    return false;
  }
  if (microphoneStream || transcribeClient) {
    stopRecording();
  }
  createTranscribeClient();
  createMicrophoneStream();
  await startStreaming(language, callback);
};

export const stopRecording = function() {
  if (microphoneStream) {
    microphoneStream.stop();
    microphoneStream.destroy();
    microphoneStream = undefined;
  }
  if (transcribeClient) {
    transcribeClient.destroy();
    //transcribeClient = undefined;
  }
};

const createTranscribeClient = () => {
  transcribeClient = new TranscribeStreamingClient({
    region: awsID.REGION,
    credentials: fromCognitoIdentityPool({
      client: new CognitoIdentityClient({region: awsID.REGION}),
      identityPoolId: awsID.COGNITO_IDENTITY_POOL_ID ,
    
    }),
  });
};

const createMicrophoneStream = async () => {
  // eslint-disable-next-line new-cap
  microphoneStream = new MicrophoneStream();
  microphoneStream.setStream(
    await window.navigator.mediaDevices.getUserMedia({
      video: false,
      audio: true,
    })
  );
};

const startStreaming = async (language, callback) => {
  const command = new StartStreamTranscriptionCommand({
    LanguageCode: language,
    MediaEncoding: 'pcm',
    MediaSampleRateHertz: SAMPLE_RATE,
    AudioStream: getAudioStream(),
  });
  const data = await transcribeClient.send(command);
  for await (const event of data.TranscriptResultStream) {
    // eslint-disable-next-line no-restricted-syntax
    for (const result of event.TranscriptEvent.Transcript.Results || []) {
      if (result.IsPartial === false) {
        const noOfResults = result.Alternatives[0].Items.length;
        for (let i = 0; i < noOfResults; i++) {
          console.log(result.Alternatives[0].Items[i].Content);
          callback(`${result.Alternatives[0].Items[i].Content} `);
        }
      }
    }
  }
};

const getAudioStream = async function*() {
  for await (const chunk of microphoneStream) {
    if (chunk.length <= SAMPLE_RATE) {
      yield {
        AudioEvent: {
          AudioChunk: encodePCMChunk(chunk),
        },
      };
    }
  }
};

const encodePCMChunk = chunk => {
  const input = MicrophoneStream.toRaw(chunk);
  let offset = 0;
  const buffer = new ArrayBuffer(input.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < input.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, input[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return Buffer.from(buffer);
};
