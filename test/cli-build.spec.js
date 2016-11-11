/*jshint jasmine: true, node: true */
'use strict';

const mock = require('mock-require');
const logger = require('winston');

describe('cli build', () => {

  afterAll(() => {
    mock.stop('../config/webpack/build.webpack.config');
  });

  it('should call getWebpackConfig', () => {
    let called = false;
    mock('../config/webpack/build.webpack.config', {
      getWebpackConfig: () => {
        called = true;
        return {};
      }
    });

    require('../cli/build')({}, {}, () => ({
      run: () => {}
    }));
    expect(called).toEqual(true);
  });

  it('should call webpack and handle fatal error', (done) => {
    spyOn(logger, 'error');
    mock('../config/webpack/build.webpack.config', {
      getWebpackConfig: () => ({})
    });

    require('../cli/build')({}, {}, () => ({
      run: (cb) => {
        cb('custom-error1');
        expect(logger.error).toHaveBeenCalledWith('custom-error1');
        done();
      }
    }));
  });

  it('should call webpack and handle stats errors and warnings', (done) => {
    const errs = ['custom-error2'];
    const wrns = ['custom-warning1'];

    spyOn(logger, 'error');
    spyOn(logger, 'warn');
    spyOn(logger, 'info');

    mock('../config/webpack/build.webpack.config', {
      getWebpackConfig: () => ({})
    });

    require('../cli/build')({}, {}, () => ({
      run: (cb) => {
        cb(null, {
          toJson: () => ({
            errors: errs,
            warnings: wrns
          })
        });
        expect(logger.error).toHaveBeenCalledWith(errs);
        expect(logger.warn).toHaveBeenCalledWith(wrns);
        expect(logger.info).toHaveBeenCalled();
        done();
      }
    }));
  });

  it('should call webpack and handle no stats errors and no warnings', (done) => {
    spyOn(logger, 'error');
    spyOn(logger, 'warn');
    spyOn(logger, 'info');

    mock('../config/webpack/build.webpack.config', {
      getWebpackConfig: () => ({})
    });

    require('../cli/build')({}, {}, () => ({
      run: (cb) => {
        cb(null, {
          toJson: () => ({
            errors: [],
            warnings: []
          })
        });
        expect(logger.error).not.toHaveBeenCalled();
        expect(logger.warn).not.toHaveBeenCalled();
        done();
      }
    }));
  });

  it('should write files to disk in AoT compile mode', (done) => {
    const fs = require('fs-extra');
    const generator = require('../lib/sky-pages-module-generator');
    const skyPagesConfigUtil = require('../config/sky-pages/sky-pages.config');

    const f = '../config/webpack/build-aot.webpack.config';

    mock(f, {
      getWebpackConfig: () => ({})
    });

    const writeJSONSpy = spyOn(fs, 'writeJSONSync');
    const copySpy = spyOn(fs, 'copySync');
    const writeFileSpy = spyOn(fs, 'writeFileSync');
    const removeSpy = spyOn(fs, 'removeSync');

    spyOn(generator, 'getSource').and.callFake(function () {
      return 'TESTSOURCE';
    });

    require('../cli/build')(
      {},
      {
        'blackbaud-sky-pages-out-skyux2': {
          compileMode: 'aot'
        }
      },
      () => ({
        run: (cb) => {
          cb(
            null,
            {
              toJson: () => ({
                errors: [],
                warnings: []
              })
            }
          );

          // The temp folder should be deleted after the build is complete.
          expect(removeSpy).toHaveBeenCalledWith(
            skyPagesConfigUtil.spaPathTemp()
          );

          done();
        }
      })
    );

    // The default SKY Pages source files should be written first.
    expect(copySpy.calls.argsFor(0)).toEqual([
      skyPagesConfigUtil.outPath('src'),
      skyPagesConfigUtil.spaPathTempSrc()
    ]);

    // The SPA project's files should be written next, overwriting any
    // files from SKY Pages' default source.
    expect(copySpy.calls.argsFor(0)).toEqual([
      skyPagesConfigUtil.spaPath('src'),
      skyPagesConfigUtil.spaPathTempSrc()
    ]);

    // Ensure the SKY Pages module is written to disk.
    expect(writeFileSpy).toHaveBeenCalledWith(
      skyPagesConfigUtil.spaPathTempSrc('app', 'sky-pages.module.ts'),
      'TESTSOURCE',
      {
        encoding: 'utf8'
      }
    );

    // Ensure the TypeScript config file is written to disk.
    expect(writeJSONSpy).toHaveBeenCalledWith(
      skyPagesConfigUtil.spaPathTempSrc('tsconfig.json'),
      jasmine.objectContaining({
        'files': [
          'app/app.module.ts',
          'app/main.aot.ts'
        ]
      })
    );

    mock.stop(f);
  });
});
