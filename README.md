[![Build, Deploy & check Integrity of preview-mirror](https://github.com/mage-os/generate-mirror-repo-js/actions/workflows/build-preview-mirror.yml/badge.svg)](https://github.com/mage-os/generate-mirror-repo-js/actions/workflows/build-preview-mirror.yml)

# Mage-OS Composer Repository Generator

## Background

This project was started not with the primary goal to go into production, but rather to explore and learn how to build Magento Open Source releases.  
It has evolved to be used in production. However, the intention is to create additional implementations, for example in Rust <https://github.com/mage-os/package-splitter>.  

## Generated composer repositories

The generator is used to generate the following composer repositories:

- https://mirror.mage-os.org
- https://upstream-nightly.mage-os.org
- https://repo.mage-os.org

It can also be used to generate custom mirrors and releases based on Mage-OS.

## Versions generated for mirrors

When generating a mirror composer repository, all packages required to install Magento Open Source 2.3.7-p3 and newer will be created.
This might change in the future.

## Usage

This project provides a docker image to generate a composer package repository.  

Mount the directory to contain the generated files into `/build` while executing the image.  
Usually this will be the DOCUMENT_ROOT of the host serving the composer repo, for example `--volume /var/www/html:/build`.  

### Specifying the build target(s)

This project can generate different types of composer repositories. At the time of writing, the supported build targets are

#### `--target=mirror` (default)

By default, a Magento Open Source mirror repository is generated.

#### `--target=upstream-nightly`

This generates a release of the current development versions of Magento Open Source. This is known as an "upstream nightly" build.

#### `--target=mageos-nightly`

This generates a release of the current development versions of Mage-OS. This is known as a "nightly" build.

#### `--target=release`

This build target requires a number of additional arguments:
* `--mageosRelease=x.x.x` The release version, for example 1.0.0
* `--mageosVendor=mage-os` The composer vendor name for the release. Defaults to `mage-os` 
* `--upstreamRelease=2.4.6-p1` The corresponding Magento Open Source release.


### Caching git repositories

Caching git repos is optional. Without caching, every git repository will be cloned each time the repo is generated. This ensures the latest versions will be used to generate the packages.  
However, cloning large repositories like Magento Open Source takes some time, so it can be beneficial to cache the cloned repository.  

A local directory can be mounted at `/generate-repo/repositories` in order to cache the cloned GitHub repos.  
Be aware that existing git repositories currently will not be updated on subsequent runs. This is mainly useful during development when executing the container image multiple times consecutively.
If you want to update a cached git repo before packages are generated, either delete the cache dir, or run `git fetch --tags` manually before executing the image. 

Example: `--volume "${HOME}/repo-cache:/generate-repo/repositories"`

### Mounting a composer dir

A `~/.composer` directory can be mounted, too, which will allow satis to benefit from existing caches. This doesn't make a big difference though.  
Example: `--volume "${COMPOSER_HOME:-$HOME/.composer}:/composer"`

### Example with docker

To generate the repository in the directory `~/html`, run the following command, replacing `https://mirror.mage-os.org` with the URL of your mirror:

```bash
docker run --rm --init -it --user $(id -u):$(id -g) \
  --volume "$(pwd)/html:/build" \
  --volume "${COMPOSER_HOME:-$HOME/.composer}:/composer" \
  magece/mageos-repo-js:latest  --target=mirror --mirror-base-url=https://mirror.mage-os.org
```

### podman

If you prefer to execute the container with `podman`, you should not specify the `--user` argument, as the in-container root user will automatically map to the current system user.
To generate the repository in `~/html` using podman, run the following command, replacing `https://mirror.mage-os.org` with the URL of your mirror:

```bash
podman run --rm --init -it \
  --volume "$(pwd)/html:/build:z"  \
  --volume "${COMPOSER_HOME:-$HOME/.composer}:/composer:z" \
  magece/mageos-repo-js:latest --mirror-base-url=https://mirror.mage-os.org
```

### Manual generation

It is possible to generate the composer repositories without a container.  
This process can be useful for automation, for example the mage-os composer repositories are built in this way via GitHub actions.  

For this, you'll need nodejs 16, php8-0 (or 7.4), yarn, git and composer.

Also, the [github.com/mage-os/php-dependency-list](https://github.com/mage-os/php-dependency-list) phar executable is expected to be in the PATH.

```sh
curl -L https://github.com/mage-os/php-dependency-list/raw/main/php-classes.phar -o /usr/local/bin/php-classes.phar
chmod +x /usr/local/bin/php-classes.phar
```

Check the corresponding workflows in `.github/workflows` for details on how to run the generation.

## Generating Mage-OS distributions (experimental)

To create a custom distribution, use the `src/make/mageos-release.js` script with `--buildConfig` option pointing to a
custom build config file anywhere. Start with a copy of `src/build-config/mageos-release-build-config.js`

### Build configuration guide

#### Use different source repositories
- change `repoUrl` and `ref` for the respective module
- this could be a different branch or a fork of the monorepo where specific modules are removed from `composer.json` and `app/code` that should not be built and included.

#### Removing metapackage dependencies (e.g. inventory):
- change `composerTemplatesPath` inside `magento2`: This path can be overridden in custom build configs. If it is not configured or a file does exist in the custom
 // path, getAdditionalDependencies() always falls back to resource/composer-templates
- copy `resources/composer-templates/mage-os/product-community-edition/dependencies-template.json` to `mage-os/product-community-edition` inside your custom composer templates directory

#### Removing packages from a monorepo source

:warning: The following prevents packages to be built, but they will still be required in the product metapackage composer.json. It is also necessary to remove them from `replace` in the source monorepo composer.json and make sure that the BASE package does not depend on their code directly or indirectly.

- for packages that are defined explicitly as individual package in `packages-config.js`: inside the configuration for the monorepo (e.g. `magento2`), add package with `skip:true` under `packageIndividual`, e.g.
    ```
    // removing packages outside of app/code that are explicitly configured in packages-config.js:
    {
        dir: 'app/design/frontend/Magento/luma',
        skip: true,
    }
    ```
- for packages, implicitly contained via `packageDirs`, e.g. all modules in `app/code` of the `magento2` monorepo, use the `excludes` configuration, e.g.:
  ```
    packageDirs: [
      {
        dir: 'app/code/Magento',
        excludes: ['app/code/Magento/Customer']
      },
    ],
  ```

#### Removing a whole repository
- remove the whole entry from the build configuration (e.g. `adobe-stock-integration`). The default configuration is only merged for repositories that are configured in the build config, so it will be ignored.

### Removing package directories or metapackages from a monorepo without removing the whole repo
- Add `skip: true` to the respective element in `packageMetaFromDirs` or `packageDirs` for this repository

## Generating custom releases based on Mage-OS

Currently, the manual generation approach needs to be used to create custom releases.  
Two things are required:

* Specify a custom vendor name using the `--mageosVendor=extreme-commerce` option
* Provide custom meta-package dependency templates in `resource/composer-templates/{vendor-name}/`  
  See the existing ones in `resource/composer-templates/mage-os` for examples.  


## Building the docker image

```bash
docker build -t magece/mirror-repo-js .
```

## Copyright 2022 Vinai Kopp, Mage-OS

Distributed under the terms of the 3-Clause BSD Licence.
See the [LICENSE](LICENSE) file for more details.
