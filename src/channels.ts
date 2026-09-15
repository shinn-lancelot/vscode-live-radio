import { Channel } from './types';

declare const __dirname: string;
declare const require: (moduleName: string) => any;

const fs = require('fs') as {
  existsSync(filePath: string): boolean;
  readFileSync(filePath: string, encoding: 'utf8'): string;
};
const path = require('path') as { join(...parts: string[]): string };

export function loadBundledChannels(): Channel[] {
  const filePaths = [
    path.join(__dirname, 'data', 'channels.json'),
    path.join(__dirname, '..', 'src', 'data', 'channels.json')
  ];
  const filePath = filePaths.find(candidate => fs.existsSync(candidate));
  if (!filePath) return [];

  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((channel): channel is Channel => Boolean(
      channel &&
      typeof channel === 'object' &&
      typeof (channel as Channel).name === 'string' &&
      typeof (channel as Channel).url === 'string'
    ));
  } catch {
    return [];
  }
}
