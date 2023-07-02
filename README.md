# git-baobab artifacts &amp; examples

This branch hosts version artifacts and examples for the git-baobab tool. Please find code and documentation on the [master branch](https://github.com/weliveindetail/git-baobab/tree/master).


# Release steps

It's not automated yet..
```
> VERSION=0.3
> PAGES=`pwd`
> MASTER=$PAGES/../git-baobab

# Generate git-baobab versioned artifacts
> cp $MASTER/baobab-static.css baobab-static.v$VERSION.css
> cp $MASTER/baobab-static.js baobab-static.v$VERSION.js
> babel-minify --removeConsole -o baobab-static.v$VERSION.min.js baobab-static.v$VERSION.js
> ARTIFACTS="-baobabjs $PAGES/baobab-static.v$VERSION.min.js -baobabcss $PAGES/baobab-static.v$VERSION.css"

# Regenerate examples
> cd /path/to/llvm-project
> git checkout 2cf681a11aea
> $MASTER/git-baobab 7b5565418f4 --cmake -b -o $PAGES/examples/llvm9-cmake.html $ARTIFACTS
> $MASTER/git-baobab 7b5565418f4 --cpp -filter ExecutionEngine -b -o $PAGES/examples/llvm9-cpp-executionengine.html $ARTIFACTS
> $MASTER/git-baobab 7b5565418f4 --cpp -exclude "/(test|unittest|unittests)/" -b -o $PAGES/examples/llvm9-cpp-sources.html $ARTIFACTS
> cd /path/to/ableton-link
> git checkout dc6dc2e28491
> $MASTER/git-baobab ae144929434a -b -o $PAGES/examples/ableton-link-since3.html $ARTIFACTS

# Generate git-baobab-me versioned artifacts
> cp $MASTER/baobab-me-static.css baobab-me-static.v$VERSION.css
> cp $MASTER/baobab-me-static.js baobab-me-static.v$VERSION.js
> babel-minify --removeConsole -o baobab-me-static.v$VERSION.min.js baobab-me-static.v$VERSION.js
```
