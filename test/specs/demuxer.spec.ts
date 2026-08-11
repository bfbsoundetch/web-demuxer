import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
interface TestFile {
  path: string;
  name: string;
}

const pageUrl = 'http://localhost:5173';
const inputFileSelector = '#example-get-media-info-file';

const getTestFiles = (filePath: string): TestFile[] => {
  const samplesDir = path.join(__dirname, filePath);
  return fs.readdirSync(samplesDir, { withFileTypes: true })
    .filter(dirent => dirent.isFile())
    .map(dirent => ({
      path: path.join(samplesDir, dirent.name),
      name: dirent.name
    }));
};

for (const {path: testFilePath, name} of getTestFiles(path.join('..', 'samples'))) {
  test(`should get correct media info for ${name}`, async ({ page }) => {
    await page.goto(pageUrl);
    await page.setInputFiles(inputFileSelector, testFilePath);

    const mediaInfo = await page.evaluate(async (inputFileSelector) => {
      const file = (document.querySelector(inputFileSelector) as HTMLInputElement).files![0];
      await window.demuxer.load(file);
      return await window.demuxer.getMediaInfo();
    }, inputFileSelector);

    const mediaInfoJsonPath = path.join(__dirname, '..', 'fixtures', 'mediainfo', name.replace(/\.[^.]+$/, '.json'));
    const expectedInfo = JSON.parse(fs.readFileSync(mediaInfoJsonPath, 'utf-8'));

    expect(mediaInfo).toBeDefined();

    const normalizeMediaInfo = (info: any) => {
      const { filename, url, ...rest } = info;
      return {
        ...rest,
        streams: info.streams.map((stream: any) => {
          return {
            ...stream,
            extradata: Array.from(stream.extradata || []),
          };
        })
      };
    };

    const normalizedActual = normalizeMediaInfo(mediaInfo);
    const normalizedExpected = normalizeMediaInfo(expectedInfo);
    
    try {
      expect(normalizedActual).toEqual(normalizedExpected);
    } catch (error) {
      console.log('Actual MediaInfo:', JSON.stringify(normalizedActual, null, 2));
      console.log('Expected MediaInfo:', JSON.stringify(normalizedExpected, null, 2));
      throw error;
    }
  });

  test(`should get correct video packet for ${name}`, async ({ page }) => {
    await page.goto(pageUrl);
    await page.setInputFiles(inputFileSelector, testFilePath);

    const videoPacket = await page.evaluate(async (inputFileSelector) => {
      const file = (document.querySelector(inputFileSelector) as HTMLInputElement).files![0];
      await window.demuxer.load(file);
      return await window.demuxer.seekMediaPacket('video', 1, 4);
    }, inputFileSelector);

    expect(videoPacket).toBeDefined();
    expect(videoPacket.size).toBeGreaterThan(0);
    expect(videoPacket.data).toBeDefined();
    expect(videoPacket.data.buffer).toBeDefined();
    expect(videoPacket.timestamp).toBeGreaterThan(0);
    expect(videoPacket.duration).toBeGreaterThan(0);
  });

  test(`should get correct audio packet for ${name}`, async ({ page }) => {
    await page.goto(pageUrl);
    await page.setInputFiles(inputFileSelector, testFilePath);

    const audioPacket = await page.evaluate(async (inputFileSelector) => {
      const file = (document.querySelector(inputFileSelector) as HTMLInputElement).files![0];
      await window.demuxer.load(file);
      return await window.demuxer.seekMediaPacket('audio', 1, 4);
    }, inputFileSelector);

    expect(audioPacket).toBeDefined();
    expect(audioPacket.size).toBeGreaterThan(0);
    expect(audioPacket.data).toBeDefined();
    expect(audioPacket.data.buffer).toBeDefined();
    expect(audioPacket.data.buffer.byteLength).toBeGreaterThan(0);
    expect(audioPacket.timestamp).toBeGreaterThan(0);
  });
}

test('should extract ID3 metadata', async ({ page }) => {
  await page.goto(pageUrl);
  await page.setInputFiles(
    inputFileSelector,
    path.join(__dirname, '..', 'samples', 'metadata', 'id3.mp3')
  );

  const tags = await page.evaluate(async (inputFileSelector) => {
    const file = (document.querySelector(inputFileSelector) as HTMLInputElement).files![0];
    await window.demuxer.load(file);
    return (await window.demuxer.getMediaInfo()).tags;
  }, inputFileSelector);

  expect(tags).toMatchObject({
    title: 'Tagged title',
    artist: 'Tagged artist',
    album: 'Tagged album',
    genre: 'Tagged genre',
    comment: 'Custom comment',
  });
});

for (const {path: testFilePath, name} of getTestFiles(path.join('..', 'samples', 'orientation'))) {
  test(`should get correct rotation and flip for ${name}`, async ({ page }) => {
    await page.goto(pageUrl);
    await page.setInputFiles(inputFileSelector, testFilePath);

    const mediaInfo = await page.evaluate(async (inputFileSelector) => {
      const file = (document.querySelector(inputFileSelector) as HTMLInputElement).files![0];
      await window.demuxer.load(file);
      return await window.demuxer.getMediaInfo();
    }, inputFileSelector);

    const mediaInfoJsonPath = path.join(__dirname, '..', 'fixtures', 'mediainfo', 'orientationinfo', name.replace(/\.[^.]+$/, '.json'));
    const expectedInfo = JSON.parse(fs.readFileSync(mediaInfoJsonPath, 'utf-8'));

    expect(mediaInfo).toBeDefined();

    // Extract only rotation and flip fields from streams
    const extractOrientationFields = (info: any) => {
      return {
        streams: info.streams.map((stream: any) => ({
          id: stream.id,
          rotation: stream.rotation,
          flip: stream.flip
        }))
      };
    };

    const actualOrientation = extractOrientationFields(mediaInfo);
    const expectedOrientation = extractOrientationFields(expectedInfo);
    
    try {
      expect(actualOrientation).toEqual(expectedOrientation);
    } catch (error) {
      console.log('Actual Orientation:', JSON.stringify(actualOrientation, null, 2));
      console.log('Expected Orientation:', JSON.stringify(expectedOrientation, null, 2));
      throw error;
    }
  });
}
