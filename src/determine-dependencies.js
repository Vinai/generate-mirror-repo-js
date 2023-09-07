const fs = require('fs/promises');
const {constants, accessSync} = require('fs');
const {tmpdir} = require('os');
const {cwd, chdir} = require('process');
const path = require('path');
const childProcess = require('child_process');
const {createHash} = require('crypto');

function fsExists(dirOrFile) {
  try {
    accessSync(dirOrFile, constants.R_OK);
    return true;
  } catch (exception) {
    return false;
  }
}

async function copyFilesToWorkDir(dir, workDir) {
  return new Promise(resolve => {
    console.log(`Preparing temporary copy in ${workDir}`);
    return fsExists(workDir)
      ? resolve()
      : fs.cp(dir, workDir, {recursive: true, filter: f => ! f.endsWith('/.git') && ! f.includes('/.git/'),}).then(() => resolve());
  });
}

async function composerInstall(workingDir) {
  return new Promise((resolve, reject) => {
    // No repository-url is needed because all packages contained in this repo are replaced in the composer.json, and
    // third-party packages will be installed form packagist.org.
    const command = `composer install --ignore-platform-reqs --no-progress --no-plugins --no-scripts`;
    console.log(`Running ${command}`);
    const bufferBytes = 4 * 1024 * 1024; // 4M
    childProcess.exec(command, {maxBuffer: bufferBytes, cwd: workingDir}, (error, stdout, stderr) => {
      if (stderr && stderr.includes('Warning: The lock file is not up to date with the latest changes in composer.json')) stderr = '';
      if (stderr && stderr.includes('Generating autoload files')) stderr = '';
      if (error) {
        reject(`Error executing command: ${error.message}`);
      }
      if (stderr) {
        reject(`[error] ${stderr}`);
      }
      resolve(stdout);
    });
  });
}

async function createWorkDir(dir) {
  const hash = createHash('md5').update(dir).digest('hex');
  const workDir = `${tmpdir()}/workdir-${hash}`;
  await copyFilesToWorkDir(dir, workDir);
  if (! fsExists(path.join(workDir, 'vendor/autoload.php'))) {
    await composerInstall(workDir);
  }
  return workDir;
}

module.exports = {
  createWorkDir,

  // This determineSourceDependencies function is used to determine the actual source dependencies for the base package
  async determineSourceDependencies(dir, files) {
    const prevCwd = cwd();
    try {
      console.log(`Determining dependencies for package being built...`);
      const workDir = await createWorkDir(dir);
      chdir(workDir);

      // Pipe php and phtml files to php-classes.phar to find referenced php classes
      return new Promise(async resolve => {
        const phpFiles = files.filter(file => file.filepath.endsWith('.php') || file.filepath.endsWith('.phtml'));
        console.log(`Inspecting ${phpFiles.length} files to determine composer dependencies...`);

        const findPackages = childProcess.spawn(path.resolve(`${__dirname}/../bin/find-composer-packages.php`), ['vendor/autoload.php']);

        let packages = '';
        findPackages.stdout.on('data', data => packages += data);
        findPackages.on('close', status => {
          resolve(JSON.parse("{" + packages.trim().split("\n").join(",\n") + "}"));
        });

        // Spawns write directly to findPackages STDIN using this stdio option:
        const options = {stdio: ['pipe', findPackages.stdin, 'pipe']}; // [stdin, stdout, stderr]

        await new Promise(resolve => {
          const classesInPhp = childProcess.spawn('php-classes.phar', [], options);
          classesInPhp.on('close', status => resolve());

          // Pipe file contents to php-classes.phar separated by a zero byte
          Promise.all(phpFiles.map(async file => {
              classesInPhp.stdin.write(file.contentBuffer);
              classesInPhp.stdin.write(Buffer.alloc(1));
          })).then(() => classesInPhp.stdin.end());
        });

        await new Promise(resolve => {
          // Pass only app/etc/di.xml file as an argument, ignore di.xml under dev/ for now
          const classesInDiXml = childProcess.spawn('php-classes.phar', ['--di.xml', 'app/etc/di.xml'], options);
          classesInDiXml.on('close', status => resolve());
        });

        findPackages.stdin.end();
      });

    } finally {
      chdir(prevCwd);
    }
  }
}
