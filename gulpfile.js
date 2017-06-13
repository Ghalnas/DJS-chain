/* eslint-env node */

var gulp = require('gulp');
var concat = require('gulp-concat');
var eslint = require('gulp-eslint');
var browserify = require('browserify');
var buffer = require('vinyl-buffer');
var transform = require('vinyl-transform');
var source = require('vinyl-source-stream');
var babelify = require('babelify');
var sourcemaps = require('gulp-sourcemaps');

gulp.task('default', ['lint', 'scripts']);
// regenerate for distribution:
gulp.task('dist', ['scripts-dist']);
// regenerate for development:
gulp.task('dev', ['scripts']);

gulp.task('lint', function () {
    gulp.src(['js/**/*.js'])
        .pipe(eslint())
        .pipe(eslint.formatEach())
        .pipe(eslint.failOnError());
});

gulp.task('scripts', function () {
    return browserify('./Site/js/main.js', {
        basedir: '.',
        debug: true,
        standalone: 'main'
    })
        .transform("babelify", {
            //compact: true,
            presets: "es2015"
        })
        .bundle()
        .on('error', function(err) {
            console.error(err);
            this.emit('end'); })
        .pipe(source('allmin.js'))
        .pipe(buffer())
        .pipe(sourcemaps.init({ loadMaps: true }))
        //.pipe(uglify())
        .pipe(sourcemaps.write('./maps'))
        .pipe(gulp.dest('./Site/dist/js'));
});

gulp.task('scripts-dist', function () {
    return browserify('./Site/js/main.js', {
        debug: true,
        standalone: 'main'
    })
        .transform("babelify", {
            compact: true,
            presets: "es2015"
        })
        .bundle()
        .on('error', function(err) {
            console.error(err);
            this.emit('end'); })
        .pipe(source('allmin.js'))
        .pipe(buffer())
        .pipe(sourcemaps.init({ loadMaps: true }))
        //.pipe(uglify())
        .pipe(sourcemaps.write('./maps'))
        .pipe(gulp.dest('./Site/dist/js'));
});

// end of gulpfile.js
