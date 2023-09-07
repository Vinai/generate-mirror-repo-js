const repo = require('./../repository');
const parseOptions = require('parse-options');
const path = require("path");
const {
  getPackageVersionMap,
  prepRelease,
  processBuildInstructions,
  validateVersionString,
  buildMageOsProductCommunityEditionMetapackage
} = require('./../release-build-tools');

const options = parseOptions(
  `$outputDir $gitRepoDir $repoUrl $mageosVendor $mageosRelease $upstreamRelease $buildConfig @help|h`,
  process.argv
);

const {
  setArchiveBaseDir,
  setMageosPackageRepoUrl,
  createPackagesForRef,
  createPackageForRef,
  createMetaPackageFromRepoDir
} = require("../package-modules");

if (options.buildConfig) {
  if (! options.buildConfig.startsWith('/')) {
    options.buildConfig = path.join(process.cwd(), options.buildConfig);
  }
}
global.scriptDir = path.resolve(__dirname, '../..')
const packagesConfig = require('../build-config/packages-config');
const {mergeBuildConfigs} = require('../utils');

const buildConfigModule = options.buildConfig || '../build-config/mageos-release-build-config';
const releaseBuildConfig = require(buildConfigModule);
const releaseInstructions = mergeBuildConfigs(packagesConfig, releaseBuildConfig);

if (options.help) {
  console.log(`Build Mage-OS release packages from github.com/mage-os git repositories.

Usage:
  node src/make/mageos-release.js [OPTIONS]

Options:
  --buildConfig=     JS module path to build configuration file (default: build-config/mageos-release-build-config)
  --outputDir=       Dir to contain the built packages (default: packages)
  --gitRepoDir=      Dir to clone repositories into (default: repositories)
  --repoUrl=         Composer repository URL to use in base package (default: https://repo.mage-os.org/)
  --mageosVendor=    Composer release vendor-name (default: mage-os)
  --mageosRelease=   Target Mage-OS release version
  --upstreamRelease= Upstream Magento Open Source release to use for package compatibility
`);
  process.exit(1);
}

const archiveDir = options.outputDir || 'packages';
setArchiveBaseDir(archiveDir);

if (options.gitRepoDir) {
  repo.setStorageDir(options.gitRepoDir);
}

if (options.repoUrl) {
  setMageosPackageRepoUrl(options.repoUrl);
}

const mageosRelease = options.mageosRelease || ''
const mageosVendor = options.mageosVendor || 'mage-os'
const upstreamRelease = options.upstreamRelease || ''

validateVersionString(mageosRelease, 'mageosRelease');
upstreamRelease && validateVersionString(upstreamRelease, 'upstreamRelease');

(async () => {
  try {

    const upstreamVersionMap = upstreamRelease
      ? await getPackageVersionMap(upstreamRelease)
      : {}

    for (const instruction of releaseInstructions) {

      const workBranch = await prepRelease(mageosRelease, mageosVendor, instruction, upstreamVersionMap)

      // TODO: maybe commit prepped branch and tag as mageosRelease?

      const releaseInstructions = {...instruction, ref: workBranch}
      await processBuildInstructions(mageosRelease, mageosVendor, releaseInstructions, upstreamVersionMap)

      // TODO: maybe push commit and tag to repoUrl? Maybe leave that as a manual step?
    }
  } catch (exception) {
    console.log(exception);
    throw exception
  }
})()
