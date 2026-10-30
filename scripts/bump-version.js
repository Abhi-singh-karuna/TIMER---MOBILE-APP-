#!/usr/bin/env node
/**
 * Bump the app version and build number in one go.
 *
 *   node scripts/bump-version.js build          1.0.0 (3) -> 1.0.0 (4)
 *   node scripts/bump-version.js patch          1.0.0 (3) -> 1.0.1 (4)
 *   node scripts/bump-version.js minor          1.0.5 (3) -> 1.1.0 (4)
 *   node scripts/bump-version.js major          1.4.2 (3) -> 2.0.0 (4)
 *   node scripts/bump-version.js 2.3.0          set an exact version (build +1)
 *   node scripts/bump-version.js build --dry-run   show the change, write nothing
 *
 * Updates:
 *   - app.json: expo.version, expo.ios.buildNumber, expo.android.versionCode
 *   - ios/CHRONOSCAPE/Info.plist: CFBundleShortVersionString, CFBundleVersion (if ios/ exists)
 *   - ios/CHRONOSCAPE.xcodeproj/project.pbxproj: MARKETING_VERSION, CURRENT_PROJECT_VERSION (if ios/ exists)
 *
 * So you can archive in Xcode straight away, without running prebuild again.
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const appJsonPath = path.join(root, 'app.json');
const plistPath = path.join(root, 'ios', 'CHRONOSCAPE', 'Info.plist');
const pbxprojPath = path.join(root, 'ios', 'CHRONOSCAPE.xcodeproj', 'project.pbxproj');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const mode = args.find((a) => !a.startsWith('--'));

if (!mode) {
    console.error('Usage: node scripts/bump-version.js <build|patch|minor|major|x.y.z> [--dry-run]');
    process.exit(1);
}

const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
const expo = appJson.expo;
const currentVersion = expo.version || '1.0.0';
const currentBuild = parseInt((expo.ios && expo.ios.buildNumber) || '0', 10) || 0;

const parts = currentVersion.split('.').map((n) => parseInt(n, 10) || 0);
while (parts.length < 3) parts.push(0);

let nextVersion;
if (mode === 'build') {
    nextVersion = currentVersion;
} else if (mode === 'patch') {
    nextVersion = `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
} else if (mode === 'minor') {
    nextVersion = `${parts[0]}.${parts[1] + 1}.0`;
} else if (mode === 'major') {
    nextVersion = `${parts[0] + 1}.0.0`;
} else if (/^\d+\.\d+\.\d+$/.test(mode)) {
    nextVersion = mode;
} else {
    console.error(`Unknown option "${mode}". Use build, patch, minor, major or an exact version like 2.3.0.`);
    process.exit(1);
}
const nextBuild = currentBuild + 1;

console.log(`Version: ${currentVersion} (${currentBuild})  ->  ${nextVersion} (${nextBuild})${dryRun ? '   [dry run]' : ''}`);

const changed = [];

// app.json
expo.version = nextVersion;
expo.ios = expo.ios || {};
expo.ios.buildNumber = String(nextBuild);
expo.android = expo.android || {};
expo.android.versionCode = nextBuild;
if (!dryRun) fs.writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2) + '\n');
changed.push('app.json');

// Info.plist
if (fs.existsSync(plistPath)) {
    let plist = fs.readFileSync(plistPath, 'utf8');
    const setKey = (key, value) => {
        const re = new RegExp(`(<key>${key}</key>\\s*<string>)[^<]*(</string>)`);
        if (!re.test(plist)) return false;
        plist = plist.replace(re, `$1${value}$2`);
        return true;
    };
    const a = setKey('CFBundleShortVersionString', nextVersion);
    const b = setKey('CFBundleVersion', String(nextBuild));
    if (a && b) {
        if (!dryRun) fs.writeFileSync(plistPath, plist);
        changed.push('ios/CHRONOSCAPE/Info.plist');
    } else {
        console.warn('! Info.plist: version keys not found, skipped');
    }
}

// Xcode project
if (fs.existsSync(pbxprojPath)) {
    let pbx = fs.readFileSync(pbxprojPath, 'utf8');
    pbx = pbx.replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${nextVersion};`);
    pbx = pbx.replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${nextBuild};`);
    if (!dryRun) fs.writeFileSync(pbxprojPath, pbx);
    changed.push('ios/CHRONOSCAPE.xcodeproj/project.pbxproj');
}

console.log(dryRun ? 'Would update:' : 'Updated:');
changed.forEach((f) => console.log(`  - ${f}`));
if (!fs.existsSync(plistPath)) {
    console.log('(No ios/ folder yet. Run: npx expo prebuild --platform ios --clean, it will use the new version from app.json.)');
}
