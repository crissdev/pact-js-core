import axios from 'axios';
import path = require('path');
import chai = require('chai');
import net = require('net');
import chaiAsPromised = require('chai-as-promised');
import {
  ConsumerMessagePact,
  ConsumerPact,
  makeConsumerMessagePact,
  makeConsumerPact,
} from '../src/consumer';
import { setLogLevel } from '../src/logger';
import { FfiSpecificationVersion } from '../src/ffi/types';

chai.use(chaiAsPromised);
const expect = chai.expect;

describe.skip('MATT protocol test', () => {
  setLogLevel('trace');

  let provider: ConsumerPact;
  let tcpProvider: ConsumerMessagePact;
  let port: number;
  const HOST = '127.0.0.1';

  describe('HTTP test', () => {
    beforeEach(() => {
      const mattRequest = `{"request": {"body": "hello"}}`;
      const mattResponse = `{"response":{"body":"world"}}`;

      provider = makeConsumerPact(
        'matt-consumer',
        'matt-provider',
        FfiSpecificationVersion.SPECIFICATION_VERSION_V4
      );
      provider.addPlugin('matt', '0.0.2');

      const interaction = provider.newInteraction('');
      interaction.uponReceiving('A request to communicate via MATT');
      interaction.withRequest('POST', '/matt');
      interaction.withPluginRequestInteractionContents(
        'application/matt',
        mattRequest
      );
      interaction.withStatus(200);
      interaction.withPluginResponseInteractionContents(
        'application/matt',
        mattResponse
      );

      port = provider.createMockServer(HOST);
    });

    afterEach(() => {
      provider.cleanupPlugins();
      provider.cleanupMockServer(port);
    });

    it('returns a valid MATT message over HTTP', () => {
      return axios
        .request({
          baseURL: `http://${HOST}:${port}`,
          headers: {
            'content-type': 'application/matt',
            Accept: 'application/matt',
          },
          data: generateMattMessage('hello'),
          method: 'POST',
          url: '/matt',
        })
        .then((res) => {
          expect(parseMattMessage(res.data)).to.eq('world');
        })
        .then(() => {
          expect(provider.mockServerMatchedSuccessfully(port)).to.be.true;
        })
        .then(() => {
          // You don't have to call this, it's just here to check it works
          const mismatches = provider.mockServerMismatches(port);
          expect(mismatches).to.have.length(0);
        })
        .then(() => {
          provider.writePactFile(path.join(__dirname, '__testoutput__'));
        });
    });
  });

  describe('TCP Messages', () => {
    beforeEach(() => {
      tcpProvider = makeConsumerMessagePact(
        'matt-tcp-consumer',
        'matt-tcp-provider',
        FfiSpecificationVersion.SPECIFICATION_VERSION_V4
      );
    });
    describe('with MATT protocol', async () => {
      afterEach(() => {
        tcpProvider.writePactFileForPluginServer(
          port,
          path.join(__dirname, '__testoutput__')
        );
        tcpProvider.cleanupPlugins();
        // tcpProvider.cleanupMockServer(port)
      });

      beforeEach(() => {
        const mattMessage = `{"request": {"body": "hellotcp"}, "response":{"body":"tcpworld"}}`;
        tcpProvider.addPlugin('matt', '0.0.2');

        const message = tcpProvider.newSynchronousMessage('a MATT message');
        message.withPluginRequestResponseInteractionContents(
          'application/matt',
          mattMessage
        );

        // TODO: this seems not to be written to the pact file
        port = tcpProvider.pactffiCreateMockServerForTransport(
          HOST,
          'matt',
          ''
        );
      });

      it('generates a pact with success', async () => {
        const message = await sendMattMessageTCP('hello', HOST, port);
        expect(message).to.eq('tcpworld');

        const res = tcpProvider.mockServerMatchedSuccessfully(port);
        expect(res).to.eq(true);

        const mismatches = tcpProvider.mockServerMismatches(port);
        expect(mismatches.length).to.eq(0);
      });
    });
  });
});

const parseMattMessage = (raw: string): string => {
  return raw.replace(/(MATT)+/g, '').trim();
};
const generateMattMessage = (raw: string): string => {
  return `MATT${raw}MATT`;
};

const sendMattMessageTCP = (
  message: string,
  host: string,
  port: number
): Promise<string> => {
  const socket = net.connect({
    port: port,
    host: host,
  });

  const res = socket.write(generateMattMessage(message) + '\n');

  if (!res) {
    throw Error('unable to connect to host');
  }

  return new Promise((resolve, reject) => {
    socket.on('data', (data) => {
      resolve(parseMattMessage(data.toString()));
    });
  });
};
