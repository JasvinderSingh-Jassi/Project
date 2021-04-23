var app = angular.module('reportingApp', []);

//<editor-fold desc="global helpers">

var isValueAnArray = function (val) {
    return Array.isArray(val);
};

var getSpec = function (str) {
    var describes = str.split('|');
    return describes[describes.length - 1];
};
var checkIfShouldDisplaySpecName = function (prevItem, item) {
    if (!prevItem) {
        item.displaySpecName = true;
    } else if (getSpec(item.description) !== getSpec(prevItem.description)) {
        item.displaySpecName = true;
    }
};

var getParent = function (str) {
    var arr = str.split('|');
    str = "";
    for (var i = arr.length - 2; i > 0; i--) {
        str += arr[i] + " > ";
    }
    return str.slice(0, -3);
};

var getShortDescription = function (str) {
    return str.split('|')[0];
};

var countLogMessages = function (item) {
    if ((!item.logWarnings || !item.logErrors) && item.browserLogs && item.browserLogs.length > 0) {
        item.logWarnings = 0;
        item.logErrors = 0;
        for (var logNumber = 0; logNumber < item.browserLogs.length; logNumber++) {
            var logEntry = item.browserLogs[logNumber];
            if (logEntry.level === 'SEVERE') {
                item.logErrors++;
            }
            if (logEntry.level === 'WARNING') {
                item.logWarnings++;
            }
        }
    }
};

var convertTimestamp = function (timestamp) {
    var d = new Date(timestamp),
        yyyy = d.getFullYear(),
        mm = ('0' + (d.getMonth() + 1)).slice(-2),
        dd = ('0' + d.getDate()).slice(-2),
        hh = d.getHours(),
        h = hh,
        min = ('0' + d.getMinutes()).slice(-2),
        ampm = 'AM',
        time;

    if (hh > 12) {
        h = hh - 12;
        ampm = 'PM';
    } else if (hh === 12) {
        h = 12;
        ampm = 'PM';
    } else if (hh === 0) {
        h = 12;
    }

    // ie: 2013-02-18, 8:35 AM
    time = yyyy + '-' + mm + '-' + dd + ', ' + h + ':' + min + ' ' + ampm;

    return time;
};

var defaultSortFunction = function sortFunction(a, b) {
    if (a.sessionId < b.sessionId) {
        return -1;
    } else if (a.sessionId > b.sessionId) {
        return 1;
    }

    if (a.timestamp < b.timestamp) {
        return -1;
    } else if (a.timestamp > b.timestamp) {
        return 1;
    }

    return 0;
};

//</editor-fold>

app.controller('ScreenshotReportController', ['$scope', '$http', 'TitleService', function ($scope, $http, titleService) {
    var that = this;
    var clientDefaults = {};

    $scope.searchSettings = Object.assign({
        description: '',
        allselected: true,
        passed: true,
        failed: true,
        pending: true,
        withLog: true
    }, clientDefaults.searchSettings || {}); // enable customisation of search settings on first page hit

    this.warningTime = 1400;
    this.dangerTime = 1900;
    this.totalDurationFormat = clientDefaults.totalDurationFormat;
    this.showTotalDurationIn = clientDefaults.showTotalDurationIn;

    var initialColumnSettings = clientDefaults.columnSettings; // enable customisation of visible columns on first page hit
    if (initialColumnSettings) {
        if (initialColumnSettings.displayTime !== undefined) {
            // initial settings have be inverted because the html bindings are inverted (e.g. !ctrl.displayTime)
            this.displayTime = !initialColumnSettings.displayTime;
        }
        if (initialColumnSettings.displayBrowser !== undefined) {
            this.displayBrowser = !initialColumnSettings.displayBrowser; // same as above
        }
        if (initialColumnSettings.displaySessionId !== undefined) {
            this.displaySessionId = !initialColumnSettings.displaySessionId; // same as above
        }
        if (initialColumnSettings.displayOS !== undefined) {
            this.displayOS = !initialColumnSettings.displayOS; // same as above
        }
        if (initialColumnSettings.inlineScreenshots !== undefined) {
            this.inlineScreenshots = initialColumnSettings.inlineScreenshots; // this setting does not have to be inverted
        } else {
            this.inlineScreenshots = false;
        }
        if (initialColumnSettings.warningTime) {
            this.warningTime = initialColumnSettings.warningTime;
        }
        if (initialColumnSettings.dangerTime) {
            this.dangerTime = initialColumnSettings.dangerTime;
        }
    }


    this.chooseAllTypes = function () {
        var value = true;
        $scope.searchSettings.allselected = !$scope.searchSettings.allselected;
        if (!$scope.searchSettings.allselected) {
            value = false;
        }

        $scope.searchSettings.passed = value;
        $scope.searchSettings.failed = value;
        $scope.searchSettings.pending = value;
        $scope.searchSettings.withLog = value;
    };

    this.isValueAnArray = function (val) {
        return isValueAnArray(val);
    };

    this.getParent = function (str) {
        return getParent(str);
    };

    this.getSpec = function (str) {
        return getSpec(str);
    };

    this.getShortDescription = function (str) {
        return getShortDescription(str);
    };
    this.hasNextScreenshot = function (index) {
        var old = index;
        return old !== this.getNextScreenshotIdx(index);
    };

    this.hasPreviousScreenshot = function (index) {
        var old = index;
        return old !== this.getPreviousScreenshotIdx(index);
    };
    this.getNextScreenshotIdx = function (index) {
        var next = index;
        var hit = false;
        while (next + 2 < this.results.length) {
            next++;
            if (this.results[next].screenShotFile && !this.results[next].pending) {
                hit = true;
                break;
            }
        }
        return hit ? next : index;
    };

    this.getPreviousScreenshotIdx = function (index) {
        var prev = index;
        var hit = false;
        while (prev > 0) {
            prev--;
            if (this.results[prev].screenShotFile && !this.results[prev].pending) {
                hit = true;
                break;
            }
        }
        return hit ? prev : index;
    };

    this.convertTimestamp = convertTimestamp;


    this.round = function (number, roundVal) {
        return (parseFloat(number) / 1000).toFixed(roundVal);
    };


    this.passCount = function () {
        var passCount = 0;
        for (var i in this.results) {
            var result = this.results[i];
            if (result.passed) {
                passCount++;
            }
        }
        return passCount;
    };


    this.pendingCount = function () {
        var pendingCount = 0;
        for (var i in this.results) {
            var result = this.results[i];
            if (result.pending) {
                pendingCount++;
            }
        }
        return pendingCount;
    };

    this.failCount = function () {
        var failCount = 0;
        for (var i in this.results) {
            var result = this.results[i];
            if (!result.passed && !result.pending) {
                failCount++;
            }
        }
        return failCount;
    };

    this.totalDuration = function () {
        var sum = 0;
        for (var i in this.results) {
            var result = this.results[i];
            if (result.duration) {
                sum += result.duration;
            }
        }
        return sum;
    };

    this.passPerc = function () {
        return (this.passCount() / this.totalCount()) * 100;
    };
    this.pendingPerc = function () {
        return (this.pendingCount() / this.totalCount()) * 100;
    };
    this.failPerc = function () {
        return (this.failCount() / this.totalCount()) * 100;
    };
    this.totalCount = function () {
        return this.passCount() + this.failCount() + this.pendingCount();
    };


    var results = [
    {
        "description": "Assert various Multiform|Assert Multiform Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 1964,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618810215425,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618810216354,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00e700bc-0079-00b6-00d5-00620072004a.png",
        "timestamp": 1618810213758,
        "duration": 16958
    },
    {
        "description": "Assert various search boxes and search result|Assert SearchFilter Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 1964,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618810232402,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618810232768,
                "type": ""
            }
        ],
        "screenShotFile": "images\\0007001d-0045-000d-00ee-00e6000d004c.png",
        "timestamp": 1618810231218,
        "duration": 5482
    },
    {
        "description": "Functionality of home page navigation bar|Assert and functionality check of delta navigation bar",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 13608,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "WARNING",
                "message": "https://www.delta.com/resources/c36db7c71763120c0d0265eb98f27f913a30d77a1d98e 18 Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check https://xhr.spec.whatwg.org/.",
                "timestamp": 1618810058096,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://gum.criteo.com/sync?c=327&a=1&r=1&u=https://pulse.delta.com/pc/delta/%3Fcw_criteoid%3D%40USERID%40 - Failed to load resource: net::ERR_CONNECTION_REFUSED",
                "timestamp": 1618810083460,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://www.delta.com/resources/c36db7c71763120c0d0265eb98f27f913a30d77a1d98e 18 Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check https://xhr.spec.whatwg.org/.",
                "timestamp": 1618810085406,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://gum.criteo.com/sync?c=327&a=1&r=1&u=https://pulse.delta.com/pc/delta/%3Fcw_criteoid%3D%40USERID%40 - Failed to load resource: net::ERR_CONNECTION_REFUSED",
                "timestamp": 1618810110883,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://www.delta.com/resources/c36db7c71763120c0d0265eb98f27f913a30d77a1d98e 18 Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check https://xhr.spec.whatwg.org/.",
                "timestamp": 1618810115573,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://delta-www.baynote.net/baynote/tags3/common?customerId=delta&code=www&timeout=undefined&onFailure=undefined - Failed to load resource: net::ERR_NAME_NOT_RESOLVED",
                "timestamp": 1618810117081,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://gum.criteo.com/sync?c=327&a=1&r=1&u=https://pulse.delta.com/pc/delta/%3Fcw_criteoid%3D%40USERID%40 - Failed to load resource: net::ERR_CONNECTION_REFUSED",
                "timestamp": 1618810140518,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://www.delta.com/resources/c36db7c71763120c0d0265eb98f27f913a30d77a1d98e 18 Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check https://xhr.spec.whatwg.org/.",
                "timestamp": 1618810143057,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://www.delta.com/resources/c36db7c71763120c0d0265eb98f27f913a30d77a1d98e 18 Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check https://xhr.spec.whatwg.org/.",
                "timestamp": 1618810148887,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://gum.criteo.com/sync?c=327&a=1&r=1&u=https://pulse.delta.com/pc/delta/%3Fcw_criteoid%3D%40USERID%40 - Failed to load resource: net::ERR_CONNECTION_REFUSED",
                "timestamp": 1618810174599,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://www.delta.com/resources/c36db7c71763120c0d0265eb98f27f913a30d77a1d98e 18 Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check https://xhr.spec.whatwg.org/.",
                "timestamp": 1618810179166,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://gum.criteo.com/sync?c=327&a=1&r=1&u=https://pulse.delta.com/pc/delta/%3Fcw_criteoid%3D%40USERID%40 - Failed to load resource: net::ERR_CONNECTION_REFUSED",
                "timestamp": 1618810206269,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://www.delta.com/resources/c36db7c71763120c0d0265eb98f27f913a30d77a1d98e 18 Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check https://xhr.spec.whatwg.org/.",
                "timestamp": 1618810211388,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://delta-www.baynote.net/baynote/tags3/common?customerId=delta&code=www&timeout=undefined&onFailure=undefined - Failed to load resource: net::ERR_NAME_NOT_RESOLVED",
                "timestamp": 1618810213992,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://ssp.delta.com/content/dam/delta-www/sorry-server/delta_sorry.html?&q=Coronavirus%27&ct=load&s=&site=delta - Failed to load resource: net::ERR_CERT_COMMON_NAME_INVALID",
                "timestamp": 1618810214578,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://content.delta.com/content/dam/delta-applications/js/sitewide/v21.4.0/criticalPath.min.js 0:5643 \" Ajax GET failed\"",
                "timestamp": 1618810218778,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://gum.criteo.com/sync?c=327&a=1&r=1&u=https://pulse.delta.com/pc/delta/%3Fcw_criteoid%3D%40USERID%40 - Failed to load resource: net::ERR_CONNECTION_REFUSED",
                "timestamp": 1618810238129,
                "type": ""
            }
        ],
        "screenShotFile": "images\\006c0052-00b3-0046-0081-001c00d0007e.png",
        "timestamp": 1618810056939,
        "duration": 181418
    },
    {
        "description": "Assert various searches and data in WebTable|Assert WebTable Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 1964,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618810237133,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618810237290,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00b600a6-0037-00b4-00b3-003800f3006d.png",
        "timestamp": 1618810236960,
        "duration": 2993
    },
    {
        "description": "Signin with invalid username and password and assert the error labels|Assert RegistrationLogin Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 1964,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618810240523,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618810240619,
                "type": ""
            }
        ],
        "screenShotFile": "images\\002c0050-0098-0026-00de-00ce00b900be.png",
        "timestamp": 1618810240416,
        "duration": 9753
    },
    {
        "description": "Assert Multiform|Assert Basic Components",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 13608,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618810239648,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618810240000,
                "type": ""
            }
        ],
        "timestamp": 1618810238538,
        "duration": 14359
    },
    {
        "description": "Assert login is successful, and assert the labels shown |Assert RegistrationLogin Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 1964,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618810250557,
                "type": ""
            }
        ],
        "screenShotFile": "images\\000300c2-007f-00f7-00f4-000700bf0035.png",
        "timestamp": 1618810250324,
        "duration": 11386
    },
    {
        "description": "Assert various search boxes and search result|Assert Scrollable Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 1964,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618810262033,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618810262292,
                "type": ""
            }
        ],
        "screenShotFile": "images\\0088006c-002c-0039-0082-000500c20037.png",
        "timestamp": 1618810261932,
        "duration": 2858
    },
    {
        "description": "Assert and upload image|Assert UploadImage Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 1964,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618810265262,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00c600eb-003c-00ce-007a-001e00ef00d9.png",
        "timestamp": 1618810265014,
        "duration": 3238
    },
    {
        "description": "Functionality of Customer Transaction|Functionality of XYZ Bank Customer login",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 1964,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618810268606,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618810268760,
                "type": ""
            }
        ],
        "screenShotFile": "images\\004a0034-005a-000d-0006-006a009a00c0.png",
        "timestamp": 1618810268495,
        "duration": 10177
    },
    {
        "description": "Functionality of Customer Deposit|Functionality of XYZ Bank Customer login",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 1964,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618810279476,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618810279699,
                "type": ""
            }
        ],
        "screenShotFile": "images\\001e00f2-0018-009a-00f7-00930011002c.png",
        "timestamp": 1618810278883,
        "duration": 3111
    },
    {
        "description": "Functionality of Customer Deposit|Functionality of XYZ Bank Customer login",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 1964,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618810282739,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618810283023,
                "type": ""
            }
        ],
        "screenShotFile": "images\\003000ba-0031-00b6-00bf-009800fc00a2.png",
        "timestamp": 1618810282210,
        "duration": 3022
    },
    {
        "description": "click Home Page|XYZ Bank Home Page",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 1964,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618810285583,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618810285830,
                "type": ""
            }
        ],
        "screenShotFile": "images\\002e006a-0042-00f3-003c-008b007f00f5.png",
        "timestamp": 1618810285452,
        "duration": 1444
    },
    {
        "description": "Assert various Multiform|Assert Multiform Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 1560,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618810269733,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618810271921,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00a8005f-00b2-00f0-005d-004c00cd002e.png",
        "timestamp": 1618810268401,
        "duration": 20260
    },
    {
        "description": "AddCustomer section|click XYZ Bank Manager login",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 1964,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618810287253,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618810287495,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00d30087-00a4-00b8-00e9-009300d200f1.png",
        "timestamp": 1618810287109,
        "duration": 3244
    },
    {
        "description": "OpenAccount section|click XYZ Bank Manager login",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 1964,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618810290741,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618810291041,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00cb0027-005e-00b2-00ef-0076004e00c1.png",
        "timestamp": 1618810290637,
        "duration": 3272
    },
    {
        "description": "Assert various search boxes and search result|Assert SearchFilter Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 1560,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618810289831,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618810290218,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00a900cc-0030-00f6-001f-003800eb00f5.png",
        "timestamp": 1618810289208,
        "duration": 4936
    },
    {
        "description": "Customers section|click XYZ Bank Manager login",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 1964,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618810294275,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618810294525,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00cb003e-0050-0034-0044-00fd00b80049.png",
        "timestamp": 1618810294146,
        "duration": 2798
    },
    {
        "description": "Assert various searches and data in WebTable|Assert WebTable Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 1560,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618810294413,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618810294620,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00da0050-004f-0058-0072-00f1005c0027.png",
        "timestamp": 1618810294310,
        "duration": 3888
    },
    {
        "description": "Valid Consumption Calculations|Assert UploadImage Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 1964,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618810297384,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618810297596,
                "type": ""
            }
        ],
        "screenShotFile": "images\\005e00d4-0080-00a8-0095-00fe007400b2.png",
        "timestamp": 1618810297278,
        "duration": 4355
    },
    {
        "description": "Invalid Consumption Calculations|Assert UploadImage Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 1964,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618810301929,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618810301972,
                "type": ""
            }
        ],
        "screenShotFile": "images\\0027000f-004d-001e-0089-006900a20066.png",
        "timestamp": 1618810301862,
        "duration": 2341
    },
    {
        "description": "Valid Simple Calculations|Assert UploadImage Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 1964,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618810304706,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00650005-000d-00a9-005f-00b900e0005f.png",
        "timestamp": 1618810304421,
        "duration": 3913
    },
    {
        "description": "Signin with invalid username and password and assert the error labels|Assert RegistrationLogin Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 1560,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618810298433,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618810298617,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00110081-0018-0044-00b3-00aa009e0053.png",
        "timestamp": 1618810298367,
        "duration": 10477
    },
    {
        "description": "Invalid Simple Calculations|Assert UploadImage Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 1964,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618810308752,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618810308960,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00b40022-002e-0058-0090-00db00d800e2.png",
        "timestamp": 1618810308573,
        "duration": 2091
    },
    {
        "description": "Assert login is successful, and assert the labels shown |Assert RegistrationLogin Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 1560,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618810309109,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618810309432,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00fe0049-0028-00bc-0091-003e00930054.png",
        "timestamp": 1618810309000,
        "duration": 11771
    },
    {
        "description": "Assert home page navigation bar|Assert Course selection home Page",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 1964,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/visits - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618810317597,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00270000-00be-005b-00fb-00ab000700a1.png",
        "timestamp": 1618810310882,
        "duration": 13224
    },
    {
        "description": "Assert various search boxes and search result|Assert Scrollable Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 1560,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618810321009,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618810321309,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00e60057-00c9-00e5-0078-001b00d90034.png",
        "timestamp": 1618810320921,
        "duration": 3690
    },
    {
        "description": "Assert and upload image|Assert UploadImage Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 1560,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618810324870,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618810325044,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00af00c8-0019-00cc-00dd-004f001e0061.png",
        "timestamp": 1618810324812,
        "duration": 2358
    },
    {
        "description": "Functionality of Customer Transaction|Functionality of XYZ Bank Customer login",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 1560,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618810327462,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618810327710,
                "type": ""
            }
        ],
        "screenShotFile": "images\\001b00f9-00ff-0091-00fc-003300ee00ff.png",
        "timestamp": 1618810327391,
        "duration": 10980
    },
    {
        "description": "Functionality of Customer Deposit|Functionality of XYZ Bank Customer login",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 1560,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618810339669,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618810340077,
                "type": ""
            }
        ],
        "screenShotFile": "images\\001200d1-00d8-000a-00d7-00cf002c00c1.png",
        "timestamp": 1618810338541,
        "duration": 4822
    },
    {
        "description": "Functionality of Customer Deposit|Functionality of XYZ Bank Customer login",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 1560,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618810343989,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618810344148,
                "type": ""
            }
        ],
        "screenShotFile": "images\\000500bf-002a-0080-007b-0033008300cb.png",
        "timestamp": 1618810343522,
        "duration": 3570
    },
    {
        "description": "functionality of home page navigation bar|Assert Course selection home Page",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 1964,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618810326009,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618810337406,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618810337407,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618810343322,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/sign_in - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618810343323,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://sso.teachable.com/ahoy/visits - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618810343324,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618810346850,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618810346851,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618810346852,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00e40058-00b6-00a2-005e-00ba00a50075.png",
        "timestamp": 1618810324583,
        "duration": 23060
    },
    {
        "description": "click Home Page|XYZ Bank Home Page",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 1560,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618810347339,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618810347592,
                "type": ""
            }
        ],
        "screenShotFile": "images\\006200c2-005c-0068-0071-00a700ef0055.png",
        "timestamp": 1618810347230,
        "duration": 1370
    },
    {
        "description": "AddCustomer section|click XYZ Bank Manager login",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 1560,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618810348836,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618810349097,
                "type": ""
            }
        ],
        "screenShotFile": "images\\005d007d-003d-00ce-005c-007300bf002b.png",
        "timestamp": 1618810348757,
        "duration": 3229
    },
    {
        "description": "OpenAccount section|click XYZ Bank Manager login",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 1560,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618810352285,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618810352526,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00770078-0038-007d-00b2-005100f10071.png",
        "timestamp": 1618810352225,
        "duration": 2509
    },
    {
        "description": "Customers section|click XYZ Bank Manager login",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 1560,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618810355073,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618810355281,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00b7002c-005f-00e7-0068-00df009e0092.png",
        "timestamp": 1618810354929,
        "duration": 2698
    },
    {
        "description": "Valid Consumption Calculations|Assert UploadImage Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 1560,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618810357965,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618810358243,
                "type": ""
            }
        ],
        "screenShotFile": "images\\002900ea-00a2-0034-00e5-00a5006b006e.png",
        "timestamp": 1618810357843,
        "duration": 4810
    },
    {
        "description": "Invalid Consumption Calculations|Assert UploadImage Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 1560,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618810362851,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618810362936,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00360096-00ce-00af-00db-009100bb0036.png",
        "timestamp": 1618810362793,
        "duration": 2237
    },
    {
        "description": "Valid Simple Calculations|Assert UploadImage Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 1560,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618810365268,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618810365346,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00f70044-00a3-0082-0038-00f500690042.png",
        "timestamp": 1618810365173,
        "duration": 3573
    },
    {
        "description": "Invalid Simple Calculations|Assert UploadImage Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 1560,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618810368936,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618810369242,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00190047-00fe-00c7-007a-008c00fa003a.png",
        "timestamp": 1618810368878,
        "duration": 2360
    },
    {
        "description": "Assert home page navigation bar|Assert Course selection home Page",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 1560,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/visits - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618810374760,
                "type": ""
            }
        ],
        "screenShotFile": "images\\004d00d2-0043-0099-00c1-00f700700029.png",
        "timestamp": 1618810371376,
        "duration": 7332
    },
    {
        "description": "Print course details|Assert Course selection",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 1964,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/sign_up - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618810348085,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618810348085,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://sso.teachable.com/secure/673/users/sign_up?reset_purchase_session=1 - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618810348216,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618810350376,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618810350378,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618810350378,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618810350379,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618810361459,
                "type": ""
            }
        ],
        "screenShotFile": "images\\008c00d9-00d2-002b-0085-004b00aa0083.png",
        "timestamp": 1618810348539,
        "duration": 33805
    },
    {
        "description": "functionality of home page navigation bar|Assert Course selection home Page",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 1560,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618810381437,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618810392153,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618810392154,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618810398006,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/sign_in - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618810398007,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://sso.teachable.com/ahoy/visits - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618810398007,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618810400554,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618810400555,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618810400559,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00980058-006a-0023-0060-00f100e500d3.png",
        "timestamp": 1618810379156,
        "duration": 22069
    },
    {
        "description": "Print author name in dropdown|Assert Course selection",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 1964,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618810391873,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618810391935,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618810391935,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618810391935,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618810391936,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618810397344,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618810397345,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00e60003-001e-0096-009d-00b300e100bd.png",
        "timestamp": 1618810382710,
        "duration": 19756
    },
    {
        "description": "Print course details|Assert Course selection",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 1560,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/sign_up - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618810401613,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618810401673,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://sso.teachable.com/secure/673/users/sign_up?reset_purchase_session=1 - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618810401733,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "deprecation 3 'window.webkitStorageInfo' is deprecated. Please use 'navigator.webkitTemporaryStorage' or 'navigator.webkitPersistentStorage' instead.",
                "timestamp": 1618810402466,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://sso.teachable.com/cdn-cgi/challenge-platform/h/b/orchestrate/captcha/v1?ray=6423c1f2ad082e41 0 chrome.loadTimes() is deprecated, instead use standardized API: Navigation Timing 2. https://www.chromestatus.com/features/5637885046816768.",
                "timestamp": 1618810402492,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://sso.teachable.com/cdn-cgi/challenge-platform/h/b/orchestrate/captcha/v1?ray=6423c1f2ad082e41 0 chrome.loadTimes() is deprecated, instead use standardized API: Navigation Timing 2. https://www.chromestatus.com/features/5637885046816768.",
                "timestamp": 1618810402492,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://sso.teachable.com/cdn-cgi/challenge-platform/h/b/orchestrate/captcha/v1?ray=6423c1f2ad082e41 0 chrome.loadTimes() is deprecated, instead use standardized API: Navigation Timing 2. https://www.chromestatus.com/features/5637885046816768.",
                "timestamp": 1618810402492,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://sso.teachable.com/cdn-cgi/challenge-platform/h/b/orchestrate/captcha/v1?ray=6423c1f2ad082e41 0 chrome.loadTimes() is deprecated, instead use standardized API: Navigation Timing 2. https://www.chromestatus.com/features/5637885046816768.",
                "timestamp": 1618810402492,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://sso.teachable.com/cdn-cgi/challenge-platform/h/b/orchestrate/captcha/v1?ray=6423c1f2ad082e41 0 chrome.loadTimes() is deprecated, instead use standardized API: Navigation Timing 2. https://www.chromestatus.com/features/5637885046816768.",
                "timestamp": 1618810402492,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://sso.teachable.com/cdn-cgi/challenge-platform/h/b/orchestrate/captcha/v1?ray=6423c1f2ad082e41 0 chrome.loadTimes() is deprecated, instead use standardized API: Paint Timing. https://www.chromestatus.com/features/5637885046816768.",
                "timestamp": 1618810402492,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://sso.teachable.com/cdn-cgi/challenge-platform/h/b/orchestrate/captcha/v1?ray=6423c1f2ad082e41 0 chrome.loadTimes() is deprecated, instead use standardized API: Paint Timing. https://www.chromestatus.com/features/5637885046816768.",
                "timestamp": 1618810402492,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://sso.teachable.com/cdn-cgi/challenge-platform/h/b/orchestrate/captcha/v1?ray=6423c1f2ad082e41 0 chrome.loadTimes() is deprecated, instead use standardized API: Navigation Timing 2. https://www.chromestatus.com/features/5637885046816768.",
                "timestamp": 1618810402492,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://sso.teachable.com/cdn-cgi/challenge-platform/h/b/orchestrate/captcha/v1?ray=6423c1f2ad082e41 0 chrome.loadTimes() is deprecated, instead use standardized API: nextHopProtocol in Navigation Timing 2. https://www.chromestatus.com/features/5637885046816768.",
                "timestamp": 1618810402492,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://sso.teachable.com/cdn-cgi/challenge-platform/h/b/orchestrate/captcha/v1?ray=6423c1f2ad082e41 0 chrome.loadTimes() is deprecated, instead use standardized API: nextHopProtocol in Navigation Timing 2. https://www.chromestatus.com/features/5637885046816768.",
                "timestamp": 1618810402492,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://sso.teachable.com/cdn-cgi/challenge-platform/h/b/orchestrate/captcha/v1?ray=6423c1f2ad082e41 0 chrome.loadTimes() is deprecated, instead use standardized API: nextHopProtocol in Navigation Timing 2. https://www.chromestatus.com/features/5637885046816768.",
                "timestamp": 1618810402492,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://sso.teachable.com/cdn-cgi/challenge-platform/h/b/orchestrate/captcha/v1?ray=6423c1f2ad082e41 0 chrome.loadTimes() is deprecated, instead use standardized API: nextHopProtocol in Navigation Timing 2. https://www.chromestatus.com/features/5637885046816768.",
                "timestamp": 1618810402492,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://sso.teachable.com/cdn-cgi/challenge-platform/h/b/orchestrate/captcha/v1?ray=6423c1f2ad082e41 0 chrome.loadTimes() is deprecated, instead use standardized API: Navigation Timing 2. https://www.chromestatus.com/features/5637885046816768.",
                "timestamp": 1618810402492,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618810403870,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618810403870,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618810403870,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618810403883,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618810414729,
                "type": ""
            }
        ],
        "screenShotFile": "images\\005a005d-0083-0098-0072-00ac00ea0088.png",
        "timestamp": 1618810402036,
        "duration": 33675
    },
    {
        "description": "Assert all courses by searching protractor|Assert Course selection",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 1964,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618810404245,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618810404245,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618810404257,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618810404258,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618810404271,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618810404271,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618810404318,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618810405322,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618810411903,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618810417016,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618810424313,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618810429417,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618810434517,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618810439999,
                "type": ""
            }
        ],
        "screenShotFile": "images\\007000bb-00e3-00ee-00c3-00fc00760037.png",
        "timestamp": 1618810402751,
        "duration": 37243
    },
    {
        "description": "Print author name in dropdown|Assert Course selection",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 1560,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618810445965,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618810445965,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618810445965,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618810445965,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618810445979,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618810451497,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618810451497,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00060082-0010-00a0-0053-003c004d0097.png",
        "timestamp": 1618810436208,
        "duration": 20534
    },
    {
        "description": "Assert home page Journey Details|Assert and functionality check of Journey Details",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 1964,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "WARNING",
                "message": "https://www.delta.com/resources/c36db7c71763120c0d0265eb98f27f913a30d77a1d98e 18 Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check https://xhr.spec.whatwg.org/.",
                "timestamp": 1618810443231,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.delta.com/apac/en - Mixed Content: The page at 'https://www.delta.com/apac/en' was loaded over HTTPS, but requested an insecure XMLHttpRequest endpoint 'http://dpm.demdex.net/id/rd?d_visid_ver=2.3.0&d_fieldgroup=MC&d_rtbd=json&d_ver=2&d_verify=1&d_orgid=F0E65E09512D2CC50A490D4D%40AdobeOrg&d_nsid=0&ts=1618810443077'. This request has been blocked; the content must be served over HTTPS.",
                "timestamp": 1618810444343,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://gum.criteo.com/sync?c=327&a=1&r=1&u=https://pulse.delta.com/pc/delta/%3Fcw_criteoid%3D%40USERID%40 - Failed to load resource: net::ERR_CONNECTION_REFUSED",
                "timestamp": 1618810470412,
                "type": ""
            }
        ],
        "screenShotFile": "images\\0021006b-00cf-0099-00f3-007c001c00dd.png",
        "timestamp": 1618810440420,
        "duration": 30383
    },
    {
        "description": "Assert all courses by searching protractor|Assert Course selection",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 1560,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618810459069,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618810459069,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618810459102,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618810459103,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618810459104,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618810459104,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618810459118,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618810460196,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618810467452,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618810472653,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618810479511,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618810484598,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618810489660,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618810494918,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00d700cb-0040-00d1-0015-00c000050072.png",
        "timestamp": 1618810457329,
        "duration": 37584
    },
    {
        "description": "Assert home page navigation bar|Assert and functionality check of delta navigation bar",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 1964,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "WARNING",
                "message": "https://www.delta.com/resources/c36db7c71763120c0d0265eb98f27f913a30d77a1d98e 18 Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check https://xhr.spec.whatwg.org/.",
                "timestamp": 1618810472798,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://gum.criteo.com/sync?c=327&a=1&r=1&u=https://pulse.delta.com/pc/delta/%3Fcw_criteoid%3D%40USERID%40 - Failed to load resource: net::ERR_CONNECTION_TIMED_OUT",
                "timestamp": 1618810498962,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00b40088-0037-004a-00bc-00fd0005007a.png",
        "timestamp": 1618810471088,
        "duration": 28212
    },
    {
        "description": "Assert home page Journey Details|Assert and functionality check of Journey Details",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 1560,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "WARNING",
                "message": "https://www.delta.com/resources/c36db7c71763120c0d0265eb98f27f913a30d77a1d98e 18 Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check https://xhr.spec.whatwg.org/.",
                "timestamp": 1618810499820,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.delta.com/apac/en - Mixed Content: The page at 'https://www.delta.com/apac/en' was loaded over HTTPS, but requested an insecure XMLHttpRequest endpoint 'http://dpm.demdex.net/id/rd?d_visid_ver=2.3.0&d_fieldgroup=MC&d_rtbd=json&d_ver=2&d_verify=1&d_orgid=F0E65E09512D2CC50A490D4D%40AdobeOrg&d_nsid=0&ts=1618810499764'. This request has been blocked; the content must be served over HTTPS.",
                "timestamp": 1618810501126,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://gum.criteo.com/sync?c=327&a=1&r=1&u=https://pulse.delta.com/pc/delta/%3Fcw_criteoid%3D%40USERID%40 - Failed to load resource: net::ERR_CONNECTION_REFUSED",
                "timestamp": 1618810526358,
                "type": ""
            }
        ],
        "screenShotFile": "images\\0063005e-000f-0018-0098-00ec009200eb.png",
        "timestamp": 1618810495098,
        "duration": 31463
    },
    {
        "description": "Assert home page navigation bar|Assert and functionality check of delta navigation bar",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 1560,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "WARNING",
                "message": "https://www.delta.com/resources/c36db7c71763120c0d0265eb98f27f913a30d77a1d98e 18 Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check https://xhr.spec.whatwg.org/.",
                "timestamp": 1618810527909,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://gum.criteo.com/sync?c=327&a=1&r=1&u=https://pulse.delta.com/pc/delta/%3Fcw_criteoid%3D%40USERID%40 - Failed to load resource: net::ERR_CONNECTION_REFUSED",
                "timestamp": 1618810553165,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00be00e6-00e0-001c-0019-00ec00bf00cc.png",
        "timestamp": 1618810526727,
        "duration": 26787
    },
    {
        "description": "Functionality of home page navigation bar|Assert and functionality check of delta navigation bar",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 1560,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "WARNING",
                "message": "https://www.delta.com/resources/c36db7c71763120c0d0265eb98f27f913a30d77a1d98e 18 Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check https://xhr.spec.whatwg.org/.",
                "timestamp": 1618810555033,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://gum.criteo.com/sync?c=327&a=1&r=1&u=https://pulse.delta.com/pc/delta/%3Fcw_criteoid%3D%40USERID%40 - Failed to load resource: net::ERR_CONNECTION_REFUSED",
                "timestamp": 1618810580539,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://www.delta.com/resources/c36db7c71763120c0d0265eb98f27f913a30d77a1d98e 18 Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check https://xhr.spec.whatwg.org/.",
                "timestamp": 1618810582023,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://gum.criteo.com/sync?c=327&a=1&r=1&u=https://pulse.delta.com/pc/delta/%3Fcw_criteoid%3D%40USERID%40 - Failed to load resource: net::ERR_CONNECTION_TIMED_OUT",
                "timestamp": 1618810586593,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://www.delta.com/resources/c36db7c71763120c0d0265eb98f27f913a30d77a1d98e 18 Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check https://xhr.spec.whatwg.org/.",
                "timestamp": 1618810592338,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://delta-www.baynote.net/baynote/tags3/common?customerId=delta&code=www&timeout=undefined&onFailure=undefined - Failed to load resource: net::ERR_NAME_NOT_RESOLVED",
                "timestamp": 1618810593992,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://gum.criteo.com/sync?c=327&a=1&r=1&u=https://pulse.delta.com/pc/delta/%3Fcw_criteoid%3D%40USERID%40 - Failed to load resource: net::ERR_CONNECTION_REFUSED",
                "timestamp": 1618810607753,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://www.delta.com/resources/c36db7c71763120c0d0265eb98f27f913a30d77a1d98e 18 Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check https://xhr.spec.whatwg.org/.",
                "timestamp": 1618810609853,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://www.delta.com/resources/c36db7c71763120c0d0265eb98f27f913a30d77a1d98e 18 Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check https://xhr.spec.whatwg.org/.",
                "timestamp": 1618810615874,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://gum.criteo.com/sync?c=327&a=1&r=1&u=https://pulse.delta.com/pc/delta/%3Fcw_criteoid%3D%40USERID%40 - Failed to load resource: net::ERR_CONNECTION_REFUSED",
                "timestamp": 1618810618049,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://www.delta.com/resources/c36db7c71763120c0d0265eb98f27f913a30d77a1d98e 18 Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check https://xhr.spec.whatwg.org/.",
                "timestamp": 1618810620665,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://gum.criteo.com/sync?c=327&a=1&r=1&u=https://pulse.delta.com/pc/delta/%3Fcw_criteoid%3D%40USERID%40 - Failed to load resource: net::ERR_CONNECTION_REFUSED",
                "timestamp": 1618810641936,
                "type": ""
            }
        ],
        "screenShotFile": "images\\004b00bd-0019-00d5-00d9-00f0007c00b5.png",
        "timestamp": 1618810553676,
        "duration": 89751
    },
    {
        "description": "Functionality of home page navigation bar|Assert and functionality check of delta navigation bar",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 1964,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.google.co.in/pagead/1p-user-list/1072374139/?guid=ON&script=0&data=medallion_status=;fare_class=;origin=;destination=;departure_date=;return_date=;pagetype=allpages;CabinType=&is_vtc=1&random=2162497355&ipr=y - Failed to load resource: net::ERR_CONNECTION_CLOSED",
                "timestamp": 1618810500513,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://www.delta.com/resources/c36db7c71763120c0d0265eb98f27f913a30d77a1d98e 18 Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check https://xhr.spec.whatwg.org/.",
                "timestamp": 1618810501205,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://gum.criteo.com/sync?c=327&a=1&r=1&u=https://pulse.delta.com/pc/delta/%3Fcw_criteoid%3D%40USERID%40 - Failed to load resource: net::ERR_CONNECTION_REFUSED",
                "timestamp": 1618810527514,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://www.delta.com/resources/c36db7c71763120c0d0265eb98f27f913a30d77a1d98e 18 Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check https://xhr.spec.whatwg.org/.",
                "timestamp": 1618810529121,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://gum.criteo.com/sync?c=327&a=1&r=1&u=https://pulse.delta.com/pc/delta/%3Fcw_criteoid%3D%40USERID%40 - Failed to load resource: net::ERR_CONNECTION_REFUSED",
                "timestamp": 1618810555009,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://www.delta.com/resources/c36db7c71763120c0d0265eb98f27f913a30d77a1d98e 18 Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check https://xhr.spec.whatwg.org/.",
                "timestamp": 1618810559519,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://delta-www.baynote.net/baynote/tags3/common?customerId=delta&code=www&timeout=undefined&onFailure=undefined - Failed to load resource: net::ERR_NAME_NOT_RESOLVED",
                "timestamp": 1618810562508,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://gum.criteo.com/sync?c=327&a=1&r=1&u=https://pulse.delta.com/pc/delta/%3Fcw_criteoid%3D%40USERID%40 - Failed to load resource: net::ERR_CONNECTION_TIMED_OUT",
                "timestamp": 1618810586800,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://www.delta.com/resources/c36db7c71763120c0d0265eb98f27f913a30d77a1d98e 18 Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check https://xhr.spec.whatwg.org/.",
                "timestamp": 1618810589543,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://www.delta.com/resources/c36db7c71763120c0d0265eb98f27f913a30d77a1d98e 18 Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check https://xhr.spec.whatwg.org/.",
                "timestamp": 1618810595638,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://gum.criteo.com/sync?c=327&a=1&r=1&u=https://pulse.delta.com/pc/delta/%3Fcw_criteoid%3D%40USERID%40 - Failed to load resource: net::ERR_CONNECTION_REFUSED",
                "timestamp": 1618810621126,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://www.delta.com/resources/c36db7c71763120c0d0265eb98f27f913a30d77a1d98e 18 Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check https://xhr.spec.whatwg.org/.",
                "timestamp": 1618810623027,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://gum.criteo.com/sync?c=327&a=1&r=1&u=https://pulse.delta.com/pc/delta/%3Fcw_criteoid%3D%40USERID%40 - Failed to load resource: net::ERR_CONNECTION_REFUSED",
                "timestamp": 1618810648056,
                "type": ""
            }
        ],
        "screenShotFile": "images\\001f00fd-00fd-0078-00bb-007d007100db.png",
        "timestamp": 1618810499497,
        "duration": 150337
    },
    {
        "description": "Assert Multiform|Assert Basic Components",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 1560,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "WARNING",
                "message": "https://www.delta.com/resources/c36db7c71763120c0d0265eb98f27f913a30d77a1d98e 18 Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check https://xhr.spec.whatwg.org/.",
                "timestamp": 1618810645422,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://delta-www.baynote.net/baynote/tags3/common?customerId=delta&code=www&timeout=undefined&onFailure=undefined - Failed to load resource: net::ERR_NAME_NOT_RESOLVED",
                "timestamp": 1618810647154,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618810648382,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618810648749,
                "type": ""
            }
        ],
        "timestamp": 1618810646900,
        "duration": 15038
    },
    {
        "description": "Assert Multiform|Assert Basic Components",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 1964,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "WARNING",
                "message": "https://www.delta.com/resources/c36db7c71763120c0d0265eb98f27f913a30d77a1d98e 18 Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check https://xhr.spec.whatwg.org/.",
                "timestamp": 1618810651550,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://delta-www.baynote.net/baynote/tags3/common?customerId=delta&code=www&timeout=undefined&onFailure=undefined - Failed to load resource: net::ERR_NAME_NOT_RESOLVED",
                "timestamp": 1618810653552,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618810655007,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618810655269,
                "type": ""
            }
        ],
        "timestamp": 1618810653288,
        "duration": 13839
    },
    {
        "description": "Assert various Multiform|Assert Multiform Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 14456,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618810669429,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618810670588,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00c900c0-009b-008a-00ea-006300f0008a.png",
        "timestamp": 1618810667876,
        "duration": 16002
    },
    {
        "description": "Assert various search boxes and search result|Assert SearchFilter Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 14456,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618810684718,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618810684914,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00b60037-0007-00e9-00f2-00c6002500c8.png",
        "timestamp": 1618810684180,
        "duration": 4529
    },
    {
        "description": "Assert various searches and data in WebTable|Assert WebTable Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 14456,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618810688869,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618810689014,
                "type": ""
            }
        ],
        "screenShotFile": "images\\000e0070-006a-00aa-005e-00df00f500ab.png",
        "timestamp": 1618810688834,
        "duration": 2629
    },
    {
        "description": "Signin with invalid username and password and assert the error labels|Assert RegistrationLogin Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 14456,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618810691700,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618810691822,
                "type": ""
            }
        ],
        "screenShotFile": "images\\001a00cb-005c-00c8-008b-00fd00c80007.png",
        "timestamp": 1618810691637,
        "duration": 9858
    },
    {
        "description": "Assert login is successful, and assert the labels shown |Assert RegistrationLogin Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 14456,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618810701616,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618810701737,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00f00069-00cd-0080-00d3-0021001b00df.png",
        "timestamp": 1618810701584,
        "duration": 10088
    },
    {
        "description": "Assert various search boxes and search result|Assert Scrollable Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 14456,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618810711826,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618810711938,
                "type": ""
            }
        ],
        "screenShotFile": "images\\005c0078-0041-0031-0016-005b005c0084.png",
        "timestamp": 1618810711766,
        "duration": 1926
    },
    {
        "description": "Assert and upload image|Assert UploadImage Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 14456,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618810713831,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618810713974,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00ea002a-005a-00ff-00d5-001700870014.png",
        "timestamp": 1618810713795,
        "duration": 2763
    },
    {
        "description": "Functionality of Customer Transaction|Functionality of XYZ Bank Customer login",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 14456,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618810716758,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618810716902,
                "type": ""
            }
        ],
        "screenShotFile": "images\\008e00a5-00be-0049-0059-00ac0030004f.png",
        "timestamp": 1618810716725,
        "duration": 5459
    },
    {
        "description": "Functionality of Customer Deposit|Functionality of XYZ Bank Customer login",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 14456,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618810722358,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618810722630,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00f600fb-0053-0048-00be-0085009b00b5.png",
        "timestamp": 1618810722297,
        "duration": 2663
    },
    {
        "description": "Functionality of Customer Deposit|Functionality of XYZ Bank Customer login",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 14456,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618810725141,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618810725344,
                "type": ""
            }
        ],
        "screenShotFile": "images\\007b0023-00fd-0061-0026-007200c400a0.png",
        "timestamp": 1618810725079,
        "duration": 1833
    },
    {
        "description": "click Home Page|XYZ Bank Home Page",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 14456,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618810727064,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618810727198,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00de00b6-00f3-0021-002a-0026003d00f9.png",
        "timestamp": 1618810727020,
        "duration": 982
    },
    {
        "description": "AddCustomer section|click XYZ Bank Manager login",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 14456,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618810728172,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618810728318,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00270055-007f-0001-002a-009800ea004d.png",
        "timestamp": 1618810728134,
        "duration": 1906
    },
    {
        "description": "OpenAccount section|click XYZ Bank Manager login",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 14456,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618810730253,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618810730516,
                "type": ""
            }
        ],
        "screenShotFile": "images\\006c006c-007b-0099-00eb-00bc00e30032.png",
        "timestamp": 1618810730177,
        "duration": 2311
    },
    {
        "description": "Customers section|click XYZ Bank Manager login",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 14456,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618810733729,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618810733901,
                "type": ""
            }
        ],
        "screenShotFile": "images\\001200ac-008a-0048-001f-0038004f002f.png",
        "timestamp": 1618810732604,
        "duration": 2553
    },
    {
        "description": "Assert various Multiform|Assert Multiform Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 3472,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618811656420,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618811658634,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00890025-003d-00a0-00c8-0069006800e4.png",
        "timestamp": 1618811654836,
        "duration": 17442
    },
    {
        "description": "Assert various search boxes and search result|Assert SearchFilter Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 3472,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618811673177,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618811673368,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00df00ce-00e4-0006-0086-00ae00c100e7.png",
        "timestamp": 1618811672751,
        "duration": 6018
    },
    {
        "description": "Assert various searches and data in WebTable|Assert WebTable Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 3472,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618811679409,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618811679583,
                "type": ""
            }
        ],
        "screenShotFile": "images\\000d00ac-00d6-003e-00cf-00bf003c0093.png",
        "timestamp": 1618811678905,
        "duration": 3571
    },
    {
        "description": "Signin with invalid username and password and assert the error labels|Assert RegistrationLogin Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 3472,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618811683574,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618811683791,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00780042-007a-00f2-009b-0042001e00fb.png",
        "timestamp": 1618811682606,
        "duration": 9763
    },
    {
        "description": "Assert login is successful, and assert the labels shown |Assert RegistrationLogin Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 3472,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618811692917,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618811693100,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00690068-0087-0080-00c4-008a00e3003a.png",
        "timestamp": 1618811692461,
        "duration": 9809
    },
    {
        "description": "Assert various search boxes and search result|Assert Scrollable Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 3472,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618811703378,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618811703540,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00ab00a1-001e-00a9-007a-00dc00230020.png",
        "timestamp": 1618811702369,
        "duration": 3547
    },
    {
        "description": "Assert and upload image|Assert UploadImage Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 3472,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618811706418,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618811706553,
                "type": ""
            }
        ],
        "screenShotFile": "images\\008f0081-0044-0062-00e9-00ea00a100d4.png",
        "timestamp": 1618811706025,
        "duration": 2482
    },
    {
        "description": "Functionality of Customer Transaction|Functionality of XYZ Bank Customer login",
        "passed": false,
        "pending": false,
        "os": "Windows",
        "instanceId": 3472,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": [
            "Error: Timeout - Async callback was not invoked within timeout specified by jasmine.DEFAULT_TIMEOUT_INTERVAL.",
            "Failed: No element found using locator: By(css selector, button[ng-click='transactions()'])",
            "Failed: Wait timed out after 40008ms"
        ],
        "trace": [
            "Error: Timeout - Async callback was not invoked within timeout specified by jasmine.DEFAULT_TIMEOUT_INTERVAL.\n    at Timeout._onTimeout (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:4281:23)\n    at listOnTimeout (internal/timers.js:554:17)\n    at processTimers (internal/timers.js:497:7)",
            "NoSuchElementError: No element found using locator: By(css selector, button[ng-click='transactions()'])\n    at C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\built\\element.js:814:27\n    at ManagedPromise.invokeCallback_ (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:1376:14)\n    at TaskQueue.execute_ (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:3084:14)\n    at TaskQueue.executeNext_ (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:3067:27)\n    at C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:2927:27\n    at C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:668:7\n    at runMicrotasks (<anonymous>)\n    at processTicksAndRejections (internal/process/task_queues.js:93:5)Error\n    at ElementArrayFinder.applyAction_ (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\built\\element.js:459:27)\n    at ElementArrayFinder.<computed> [as click] (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\built\\element.js:91:29)\n    at ElementFinder.<computed> [as click] (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\built\\element.js:831:22)\n    at UserContext.<anonymous> (C:\\Users\\Jasvinder Singh\\Documents\\Project\\Test Cases\\Small Projects_spec\\Banking_spec\\XYZ Bank_Customer_Login_spec.js:63:40)\n    at C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasminewd2\\index.js:112:25\n    at new ManagedPromise (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:1077:7)\n    at ControlFlow.promise (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:2505:12)\n    at schedulerExecute (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasminewd2\\index.js:95:18)\n    at TaskQueue.execute_ (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:3084:14)\n    at TaskQueue.executeNext_ (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:3067:27)\nFrom: Task: Run it(\"Functionality of Customer Transaction\") in control flow\n    at UserContext.<anonymous> (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasminewd2\\index.js:94:19)\n    at attempt (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:4297:26)\n    at QueueRunner.run (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:4217:20)\n    at runNext (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:4257:20)\n    at C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:4264:13\n    at C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:4172:9\n    at Timeout.<anonymous> (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:4283:11)\n    at listOnTimeout (internal/timers.js:554:17)\n    at processTimers (internal/timers.js:497:7)\nFrom asynchronous test: \nError\n    at Suite.<anonymous> (C:\\Users\\Jasvinder Singh\\Documents\\Project\\Test Cases\\Small Projects_spec\\Banking_spec\\XYZ Bank_Customer_Login_spec.js:60:3)\n    at addSpecsToSuite (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:1107:25)\n    at Env.describe (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:1074:7)\n    at describe (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:4399:18)\n    at Object.<anonymous> (C:\\Users\\Jasvinder Singh\\Documents\\Project\\Test Cases\\Small Projects_spec\\Banking_spec\\XYZ Bank_Customer_Login_spec.js:6:1)\n    at Module._compile (internal/modules/cjs/loader.js:1063:30)\n    at Object.Module._extensions..js (internal/modules/cjs/loader.js:1092:10)\n    at Module.load (internal/modules/cjs/loader.js:928:32)\n    at Function.Module._load (internal/modules/cjs/loader.js:769:14)",
            "TimeoutError: Wait timed out after 40008ms\n    at C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:2201:17\n    at ManagedPromise.invokeCallback_ (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:1376:14)\n    at TaskQueue.execute_ (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:3084:14)\n    at TaskQueue.executeNext_ (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:3067:27)\n    at C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:2927:27\n    at C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:668:7\n    at runMicrotasks (<anonymous>)\n    at processTicksAndRejections (internal/process/task_queues.js:93:5)\nFrom: Task: <anonymous wait>\n    at scheduleWait (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:2188:20)\n    at ControlFlow.wait (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:2517:12)\n    at Driver.wait (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\webdriver.js:934:29)\n    at run (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\built\\browser.js:58:33)\n    at ProtractorBrowser.to.<computed> [as wait] (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\built\\browser.js:66:16)\n    at util.wait (C:\\Users\\Jasvinder Singh\\Documents\\Project\\TestUtil.js:12:15)\n    at UserContext.<anonymous> (C:\\Users\\Jasvinder Singh\\Documents\\Project\\Test Cases\\Small Projects_spec\\Banking_spec\\XYZ Bank_Customer_Login_spec.js:36:10)\n    at C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasminewd2\\index.js:112:25\n    at new ManagedPromise (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:1077:7)\n    at ControlFlow.promise (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:2505:12)\nFrom: Task: Run beforeEach in control flow\n    at UserContext.<anonymous> (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasminewd2\\index.js:94:19)\n    at attempt (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:4297:26)\n    at QueueRunner.run (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:4217:20)\n    at runNext (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:4257:20)\n    at C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:4264:13\n    at C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:4172:9\n    at C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasminewd2\\index.js:64:48\n    at ControlFlow.emit (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\events.js:62:21)\n    at ControlFlow.shutdown_ (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:2674:10)\n    at C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:2599:53\nFrom asynchronous test: \nError\n    at Suite.<anonymous> (C:\\Users\\Jasvinder Singh\\Documents\\Project\\Test Cases\\Small Projects_spec\\Banking_spec\\XYZ Bank_Customer_Login_spec.js:10:3)\n    at addSpecsToSuite (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:1107:25)\n    at Env.describe (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:1074:7)\n    at describe (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:4399:18)\n    at Object.<anonymous> (C:\\Users\\Jasvinder Singh\\Documents\\Project\\Test Cases\\Small Projects_spec\\Banking_spec\\XYZ Bank_Customer_Login_spec.js:6:1)\n    at Module._compile (internal/modules/cjs/loader.js:1063:30)\n    at Object.Module._extensions..js (internal/modules/cjs/loader.js:1092:10)\n    at Module.load (internal/modules/cjs/loader.js:928:32)\n    at Function.Module._load (internal/modules/cjs/loader.js:769:14)"
        ],
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618811709739,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618811709864,
                "type": ""
            }
        ],
        "screenShotFile": "images\\007a0069-00ab-0004-0044-0027005f0007.png",
        "timestamp": 1618811708691,
        "duration": 44096
    },
    {
        "description": "Functionality of Customer Deposit|Functionality of XYZ Bank Customer login",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 3472,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618811756873,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618811757097,
                "type": ""
            }
        ],
        "screenShotFile": "images\\000d00c6-00f1-00ad-002a-00b2002a0068.png",
        "timestamp": 1618811752886,
        "duration": 9280
    },
    {
        "description": "Functionality of Customer Deposit|Functionality of XYZ Bank Customer login",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 3472,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618811763349,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618811763588,
                "type": ""
            }
        ],
        "screenShotFile": "images\\007500b6-000d-00e4-0002-006d00da00a0.png",
        "timestamp": 1618811762287,
        "duration": 3185
    },
    {
        "description": "click Home Page|XYZ Bank Home Page",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 3472,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618811766702,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618811766906,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00750001-006c-00f6-00c8-00e8003b00ad.png",
        "timestamp": 1618811765584,
        "duration": 2034
    },
    {
        "description": "AddCustomer section|click XYZ Bank Manager login",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 3472,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618811769051,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618811769165,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00780040-00b0-0060-00a2-00d700d400ef.png",
        "timestamp": 1618811767730,
        "duration": 2856
    },
    {
        "description": "OpenAccount section|click XYZ Bank Manager login",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 3472,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618811771347,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618811771423,
                "type": ""
            }
        ],
        "screenShotFile": "images\\000a00a8-0099-00f7-000e-006f00870011.png",
        "timestamp": 1618811770737,
        "duration": 2596
    },
    {
        "description": "Customers section|click XYZ Bank Manager login",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 3472,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618811774074,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618811774239,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00bf0093-0013-003c-00c2-0072009b00fc.png",
        "timestamp": 1618811773482,
        "duration": 2937
    },
    {
        "description": "Valid Consumption Calculations|Assert UploadImage Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 3472,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618811776979,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618811777122,
                "type": ""
            }
        ],
        "screenShotFile": "images\\006c0039-0088-0043-00ad-00fc00aa0039.png",
        "timestamp": 1618811776547,
        "duration": 4015
    },
    {
        "description": "Invalid Consumption Calculations|Assert UploadImage Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 3472,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618811781763,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618811781926,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00ea00a4-00f0-0021-00b2-0011007f00f7.png",
        "timestamp": 1618811780676,
        "duration": 2704
    },
    {
        "description": "Valid Simple Calculations|Assert UploadImage Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 3472,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618811784550,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618811784747,
                "type": ""
            }
        ],
        "screenShotFile": "images\\004d0055-0040-0078-00e4-00d900c40004.png",
        "timestamp": 1618811783494,
        "duration": 5880
    },
    {
        "description": "Invalid Simple Calculations|Assert UploadImage Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 3472,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618811790188,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618811790321,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00670096-001d-0056-002e-001300a50097.png",
        "timestamp": 1618811789485,
        "duration": 1904
    },
    {
        "description": "Assert home page navigation bar|Assert Course selection home Page",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 3472,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/visits - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618811798292,
                "type": ""
            }
        ],
        "screenShotFile": "images\\0023002d-0071-00de-0087-0084001e003d.png",
        "timestamp": 1618811791506,
        "duration": 15331
    },
    {
        "description": "functionality of home page navigation bar|Assert Course selection home Page",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 3472,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618811808779,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618811816393,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618811816514,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618811821877,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/sign_in - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618811821877,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://sso.teachable.com/ahoy/visits - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618811821878,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618811824041,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618811824042,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618811824042,
                "type": ""
            }
        ],
        "screenShotFile": "images\\0069009b-0009-0061-00e8-00e0003c001d.png",
        "timestamp": 1618811807085,
        "duration": 17523
    },
    {
        "description": "Print course details|Assert Course selection",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 3472,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/sign_up - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618811825015,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618811825144,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://sso.teachable.com/secure/673/users/sign_up?reset_purchase_session=1 - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618811825176,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "deprecation 3 'window.webkitStorageInfo' is deprecated. Please use 'navigator.webkitTemporaryStorage' or 'navigator.webkitPersistentStorage' instead.",
                "timestamp": 1618811825992,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00a60088-00ce-0048-009b-00c4009f0095.png",
        "timestamp": 1618811824909,
        "duration": 31871
    },
    {
        "description": "Print author name in dropdown|Assert Course selection",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 3472,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618811869779,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618811869780,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618811869782,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618811869783,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618811875264,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618811875264,
                "type": ""
            }
        ],
        "screenShotFile": "images\\0079009c-0050-0079-00f1-00bb00000089.png",
        "timestamp": 1618811856908,
        "duration": 23458
    },
    {
        "description": "Assert all courses by searching protractor|Assert Course selection",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 3472,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618811881960,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618811881983,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618811882001,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618811882147,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618811882148,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618811882149,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618811883049,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618811888913,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618811894001,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618811900976,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618811906066,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618811911154,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618811916425,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00f3003c-00fc-00d7-00c9-003d003d009a.png",
        "timestamp": 1618811880550,
        "duration": 35869
    },
    {
        "description": "Assert home page Journey Details|Assert and functionality check of Journey Details",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 3472,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "WARNING",
                "message": "https://www.delta.com/resources/c36db7c71763120c0d0265eb98f27f913a30d77a1d98e 18 Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check https://xhr.spec.whatwg.org/.",
                "timestamp": 1618811921080,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.delta.com/apac/en - Mixed Content: The page at 'https://www.delta.com/apac/en' was loaded over HTTPS, but requested an insecure XMLHttpRequest endpoint 'http://dpm.demdex.net/id/rd?d_visid_ver=2.3.0&d_fieldgroup=MC&d_rtbd=json&d_ver=2&d_verify=1&d_orgid=F0E65E09512D2CC50A490D4D%40AdobeOrg&d_nsid=0&ts=1618811921031'. This request has been blocked; the content must be served over HTTPS.",
                "timestamp": 1618811921873,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://gum.criteo.com/sync?c=327&a=1&r=1&u=https://pulse.delta.com/pc/delta/%3Fcw_criteoid%3D%40USERID%40 - Failed to load resource: net::ERR_CONNECTION_REFUSED",
                "timestamp": 1618811946996,
                "type": ""
            }
        ],
        "screenShotFile": "images\\008200f6-0078-00ef-007d-00ed00310012.png",
        "timestamp": 1618811916620,
        "duration": 30605
    },
    {
        "description": "Assert home page navigation bar|Assert and functionality check of delta navigation bar",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 3472,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "WARNING",
                "message": "https://www.delta.com/resources/c36db7c71763120c0d0265eb98f27f913a30d77a1d98e 18 Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check https://xhr.spec.whatwg.org/.",
                "timestamp": 1618811948499,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://gum.criteo.com/sync?c=327&a=1&r=1&u=https://pulse.delta.com/pc/delta/%3Fcw_criteoid%3D%40USERID%40 - Failed to load resource: net::ERR_CONNECTION_REFUSED",
                "timestamp": 1618811973343,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00260063-00f4-00c9-00c9-0036003d0061.png",
        "timestamp": 1618811947390,
        "duration": 26291
    },
    {
        "description": "Functionality of home page navigation bar|Assert and functionality check of delta navigation bar",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 3472,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "WARNING",
                "message": "https://www.delta.com/resources/c36db7c71763120c0d0265eb98f27f913a30d77a1d98e 18 Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check https://xhr.spec.whatwg.org/.",
                "timestamp": 1618811975036,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://gum.criteo.com/sync?c=327&a=1&r=1&u=https://pulse.delta.com/pc/delta/%3Fcw_criteoid%3D%40USERID%40 - Failed to load resource: net::ERR_CONNECTION_REFUSED",
                "timestamp": 1618811999872,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://www.delta.com/resources/c36db7c71763120c0d0265eb98f27f913a30d77a1d98e 18 Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check https://xhr.spec.whatwg.org/.",
                "timestamp": 1618812001386,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://gum.criteo.com/sync?c=327&a=1&r=1&u=https://pulse.delta.com/pc/delta/%3Fcw_criteoid%3D%40USERID%40 - Failed to load resource: net::ERR_CONNECTION_REFUSED",
                "timestamp": 1618812026448,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://www.delta.com/resources/c36db7c71763120c0d0265eb98f27f913a30d77a1d98e 18 Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check https://xhr.spec.whatwg.org/.",
                "timestamp": 1618812030034,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://delta-www.baynote.net/baynote/tags3/common?customerId=delta&code=www&timeout=undefined&onFailure=undefined - Failed to load resource: net::ERR_NAME_NOT_RESOLVED",
                "timestamp": 1618812031251,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://gum.criteo.com/sync?c=327&a=1&r=1&u=https://pulse.delta.com/pc/delta/%3Fcw_criteoid%3D%40USERID%40 - Failed to load resource: net::ERR_CONNECTION_REFUSED",
                "timestamp": 1618812054576,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://www.delta.com/resources/c36db7c71763120c0d0265eb98f27f913a30d77a1d98e 18 Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check https://xhr.spec.whatwg.org/.",
                "timestamp": 1618812056381,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://www.delta.com/resources/c36db7c71763120c0d0265eb98f27f913a30d77a1d98e 18 Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check https://xhr.spec.whatwg.org/.",
                "timestamp": 1618812059983,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://gum.criteo.com/sync?c=327&a=1&r=1&u=https://pulse.delta.com/pc/delta/%3Fcw_criteoid%3D%40USERID%40 - Failed to load resource: net::ERR_CONNECTION_REFUSED",
                "timestamp": 1618812084911,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://www.delta.com/resources/c36db7c71763120c0d0265eb98f27f913a30d77a1d98e 18 Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check https://xhr.spec.whatwg.org/.",
                "timestamp": 1618812086424,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://gum.criteo.com/sync?c=327&a=1&r=1&u=https://pulse.delta.com/pc/delta/%3Fcw_criteoid%3D%40USERID%40 - Failed to load resource: net::ERR_CONNECTION_TIMED_OUT",
                "timestamp": 1618812111573,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://www.delta.com/resources/c36db7c71763120c0d0265eb98f27f913a30d77a1d98e 18 Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check https://xhr.spec.whatwg.org/.",
                "timestamp": 1618812114022,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://delta-www.baynote.net/baynote/tags3/common?customerId=delta&code=www&timeout=undefined&onFailure=undefined - Failed to load resource: net::ERR_NAME_NOT_RESOLVED",
                "timestamp": 1618812115526,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://ssp.delta.com/content/dam/delta-www/sorry-server/delta_sorry.html?&q=Coronavirus%27&ct=load&s=&site=delta - Failed to load resource: net::ERR_CERT_COMMON_NAME_INVALID",
                "timestamp": 1618812117483,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://content.delta.com/content/dam/delta-applications/js/sitewide/v21.4.0/criticalPath.min.js 0:5643 \" Ajax GET failed\"",
                "timestamp": 1618812120746,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://gum.criteo.com/sync?c=327&a=1&r=1&u=https://pulse.delta.com/pc/delta/%3Fcw_criteoid%3D%40USERID%40 - Failed to load resource: net::ERR_CONNECTION_REFUSED",
                "timestamp": 1618812139176,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00e5003d-0012-0062-00e3-007100540020.png",
        "timestamp": 1618811973868,
        "duration": 165416
    },
    {
        "description": "Assert Multiform|Assert Basic Components",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 3472,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618812140846,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618812141051,
                "type": ""
            }
        ],
        "timestamp": 1618812139414,
        "duration": 13202
    },
    {
        "description": "Assert various Multiform|Assert Multiform Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 10468,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618812268637,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618812270234,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00f200b2-00ae-002a-0039-00f400b1002d.png",
        "timestamp": 1618812266900,
        "duration": 17018
    },
    {
        "description": "Assert various search boxes and search result|Assert SearchFilter Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 10468,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618812285034,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618812285249,
                "type": ""
            }
        ],
        "screenShotFile": "images\\001300a2-00a1-0037-00f6-0079009c007c.png",
        "timestamp": 1618812284237,
        "duration": 5214
    },
    {
        "description": "Assert various searches and data in WebTable|Assert WebTable Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 10468,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618812290570,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618812290759,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00db00a4-000a-00fe-004f-00ac00f60040.png",
        "timestamp": 1618812289626,
        "duration": 3839
    },
    {
        "description": "Signin with invalid username and password and assert the error labels|Assert RegistrationLogin Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 10468,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618812294207,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618812294413,
                "type": ""
            }
        ],
        "screenShotFile": "images\\005800f4-00cc-00e4-003c-003300f6008a.png",
        "timestamp": 1618812293603,
        "duration": 9719
    },
    {
        "description": "Assert login is successful, and assert the labels shown |Assert RegistrationLogin Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 10468,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618812304178,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618812304330,
                "type": ""
            }
        ],
        "screenShotFile": "images\\006000fc-005b-001f-0032-009700630067.png",
        "timestamp": 1618812303406,
        "duration": 10738
    },
    {
        "description": "Assert various search boxes and search result|Assert Scrollable Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 10468,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618812314674,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618812314896,
                "type": ""
            }
        ],
        "screenShotFile": "images\\004b0039-00e4-0072-0034-00a70029003e.png",
        "timestamp": 1618812314255,
        "duration": 2455
    },
    {
        "description": "Assert and upload image|Assert UploadImage Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 10468,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618812317276,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618812317405,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00120078-00cb-0034-000e-002200a1007f.png",
        "timestamp": 1618812316835,
        "duration": 3263
    },
    {
        "description": "Functionality of Customer Transaction|Functionality of XYZ Bank Customer login",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 10468,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618812320784,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618812320917,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00fe006e-006b-00a1-00d8-00e300470066.png",
        "timestamp": 1618812320262,
        "duration": 6435
    },
    {
        "description": "Functionality of Customer Deposit|Functionality of XYZ Bank Customer login",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 10468,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618812327533,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618812327729,
                "type": ""
            }
        ],
        "screenShotFile": "images\\0054002b-00e7-00f3-0015-0075005a0070.png",
        "timestamp": 1618812326819,
        "duration": 2576
    },
    {
        "description": "Functionality of Customer Deposit|Functionality of XYZ Bank Customer login",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 10468,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618812330510,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618812330676,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00900002-00df-009d-00db-0013005400ac.png",
        "timestamp": 1618812329504,
        "duration": 3329
    },
    {
        "description": "click Home Page|XYZ Bank Home Page",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 10468,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618812333401,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618812333581,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00d600f2-0001-009a-0046-008a00bb00d0.png",
        "timestamp": 1618812332964,
        "duration": 1310
    },
    {
        "description": "AddCustomer section|click XYZ Bank Manager login",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 10468,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618812334808,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618812334953,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00890041-00f2-00a0-008e-00fe00bd000a.png",
        "timestamp": 1618812334385,
        "duration": 2132
    },
    {
        "description": "OpenAccount section|click XYZ Bank Manager login",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 10468,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618812337092,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618812337224,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00a2001a-00a7-0079-00f0-005800190032.png",
        "timestamp": 1618812336661,
        "duration": 2030
    },
    {
        "description": "Customers section|click XYZ Bank Manager login",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 10468,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618812339775,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618812339980,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00950082-00ab-0061-007c-003700ec00e1.png",
        "timestamp": 1618812338807,
        "duration": 2987
    },
    {
        "description": "Valid Consumption Calculations|Assert UploadImage Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 10468,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618812342876,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618812342967,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00d90099-0010-0034-0009-00c300110037.png",
        "timestamp": 1618812341899,
        "duration": 4320
    },
    {
        "description": "Invalid Consumption Calculations|Assert UploadImage Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 10468,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618812347084,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618812347128,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00030057-004e-0064-0082-00ef00d100cc.png",
        "timestamp": 1618812346316,
        "duration": 2018
    },
    {
        "description": "Valid Simple Calculations|Assert UploadImage Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 10468,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618812348864,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618812348895,
                "type": ""
            }
        ],
        "screenShotFile": "images\\004200a7-001d-0081-006e-00cc009800ce.png",
        "timestamp": 1618812348455,
        "duration": 3121
    },
    {
        "description": "Invalid Simple Calculations|Assert UploadImage Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 10468,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618812354084,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00f700b9-00ae-00cb-00d9-000b00bb00aa.png",
        "timestamp": 1618812351684,
        "duration": 3400
    },
    {
        "description": "Assert home page navigation bar|Assert Course selection home Page",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 10468,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/visits - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618812359178,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00ea0054-00e2-00da-0090-000500d200ee.png",
        "timestamp": 1618812355205,
        "duration": 9069
    },
    {
        "description": "functionality of home page navigation bar|Assert Course selection home Page",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 10468,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618812366032,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://fonts.googleapis.com/css?family=Open+Sans:700,600,400,300|Montserrat:400,700|Lato:400,300,700,900,400italic - Failed to load resource: net::ERR_CONNECTION_CLOSED",
                "timestamp": 1618812366816,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618812375088,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618812375088,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618812380275,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/sign_in - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618812380276,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://sso.teachable.com/ahoy/visits - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618812380276,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618812383648,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618812383649,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618812383651,
                "type": ""
            }
        ],
        "screenShotFile": "images\\004300b8-0034-0090-00b6-009b00230035.png",
        "timestamp": 1618812364514,
        "duration": 19672
    },
    {
        "description": "Print course details|Assert Course selection",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 10468,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618812384740,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/sign_up - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618812385320,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://sso.teachable.com/secure/673/users/sign_up?reset_purchase_session=1 - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618812385441,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://sso.teachable.com/cdn-cgi/challenge-platform/h/b/orchestrate/captcha/v1?ray=6423f260fbfe2e33 0:28706 Uncaught TypeError: Cannot read property 'chC' of undefined",
                "timestamp": 1618812395705,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://sso.teachable.com/cdn-cgi/challenge-platform/h/b/orchestrate/captcha/v1?ray=6423f260fbfe2e33 0:26568 Uncaught TypeError: Cannot read property 'log' of undefined",
                "timestamp": 1618812395705,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "deprecation 3 'window.webkitStorageInfo' is deprecated. Please use 'navigator.webkitTemporaryStorage' or 'navigator.webkitPersistentStorage' instead.",
                "timestamp": 1618812395705,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://sso.teachable.com/cdn-cgi/challenge-platform/h/b/orchestrate/captcha/v1?ray=6423f260fbfe2e33 0:29828 Uncaught TypeError: d[c(...)] is not a function",
                "timestamp": 1618812395707,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://sso.teachable.com/cdn-cgi/challenge-platform/h/b/orchestrate/captcha/v1?ray=6423f260fbfe2e33 0:26568 Uncaught TypeError: Cannot read property 'log' of undefined",
                "timestamp": 1618812395707,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://sso.teachable.com/cdn-cgi/challenge-platform/h/b/orchestrate/captcha/v1?ray=6423f260fbfe2e33 0:12530 Uncaught TypeError: d[c(...)] is not a function",
                "timestamp": 1618812395708,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://sso.teachable.com/cdn-cgi/challenge-platform/h/b/orchestrate/captcha/v1?ray=6423f260fbfe2e33 0:26568 Uncaught TypeError: Cannot read property 'log' of undefined",
                "timestamp": 1618812395708,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00d100b4-001a-008c-000a-0041005c001f.png",
        "timestamp": 1618812384469,
        "duration": 31303
    },
    {
        "description": "Print author name in dropdown|Assert Course selection",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 10468,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618812417733,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618812417734,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618812417742,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618812417743,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618812423242,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618812423243,
                "type": ""
            }
        ],
        "screenShotFile": "images\\000b0041-006b-0030-0022-00a5005c009e.png",
        "timestamp": 1618812415913,
        "duration": 12425
    },
    {
        "description": "Assert all courses by searching protractor|Assert Course selection",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 10468,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618812430403,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618812430409,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618812430410,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618812430410,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618812430414,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618812430414,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618812431443,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618812437520,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618812442638,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618812449381,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618812454470,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618812459545,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618812464839,
                "type": ""
            }
        ],
        "screenShotFile": "images\\009c0015-008b-0028-00e0-007f00bd0021.png",
        "timestamp": 1618812428549,
        "duration": 36285
    },
    {
        "description": "Assert home page Journey Details|Assert and functionality check of Journey Details",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 10468,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "WARNING",
                "message": "https://www.delta.com/resources/c36db7c71763120c0d0265eb98f27f913a30d77a1d98e 18 Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check https://xhr.spec.whatwg.org/.",
                "timestamp": 1618812468763,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.delta.com/apac/en - Mixed Content: The page at 'https://www.delta.com/apac/en' was loaded over HTTPS, but requested an insecure XMLHttpRequest endpoint 'http://dpm.demdex.net/id/rd?d_visid_ver=2.3.0&d_fieldgroup=MC&d_rtbd=json&d_ver=2&d_verify=1&d_orgid=F0E65E09512D2CC50A490D4D%40AdobeOrg&d_nsid=0&ts=1618812468716'. This request has been blocked; the content must be served over HTTPS.",
                "timestamp": 1618812469599,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://gum.criteo.com/sync?c=327&a=1&r=1&u=https://pulse.delta.com/pc/delta/%3Fcw_criteoid%3D%40USERID%40 - Failed to load resource: net::ERR_CONNECTION_REFUSED",
                "timestamp": 1618812494434,
                "type": ""
            }
        ],
        "screenShotFile": "images\\0086006f-00ed-00b1-0015-006500d00048.png",
        "timestamp": 1618812465028,
        "duration": 29571
    },
    {
        "description": "Assert home page navigation bar|Assert and functionality check of delta navigation bar",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 10468,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "WARNING",
                "message": "https://www.delta.com/resources/c36db7c71763120c0d0265eb98f27f913a30d77a1d98e 18 Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check https://xhr.spec.whatwg.org/.",
                "timestamp": 1618812495828,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://gum.criteo.com/sync?c=327&a=1&r=1&u=https://pulse.delta.com/pc/delta/%3Fcw_criteoid%3D%40USERID%40 - Failed to load resource: net::ERR_CONNECTION_REFUSED",
                "timestamp": 1618812521066,
                "type": ""
            }
        ],
        "screenShotFile": "images\\001700a4-0072-0008-0024-00f5008d0023.png",
        "timestamp": 1618812494767,
        "duration": 26643
    },
    {
        "description": "Functionality of home page navigation bar|Assert and functionality check of delta navigation bar",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 10468,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "WARNING",
                "message": "https://www.delta.com/resources/c36db7c71763120c0d0265eb98f27f913a30d77a1d98e 18 Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check https://xhr.spec.whatwg.org/.",
                "timestamp": 1618812522950,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://gum.criteo.com/sync?c=327&a=1&r=1&u=https://pulse.delta.com/pc/delta/%3Fcw_criteoid%3D%40USERID%40 - Failed to load resource: net::ERR_CONNECTION_TIMED_OUT",
                "timestamp": 1618812548216,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://www.delta.com/resources/c36db7c71763120c0d0265eb98f27f913a30d77a1d98e 18 Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check https://xhr.spec.whatwg.org/.",
                "timestamp": 1618812549678,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://gum.criteo.com/sync?c=327&a=1&r=1&u=https://pulse.delta.com/pc/delta/%3Fcw_criteoid%3D%40USERID%40 - Failed to load resource: net::ERR_CONNECTION_REFUSED",
                "timestamp": 1618812574763,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://www.delta.com/resources/c36db7c71763120c0d0265eb98f27f913a30d77a1d98e 18 Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check https://xhr.spec.whatwg.org/.",
                "timestamp": 1618812578367,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://delta-www.baynote.net/baynote/tags3/common?customerId=delta&code=www&timeout=undefined&onFailure=undefined - Failed to load resource: net::ERR_NAME_NOT_RESOLVED",
                "timestamp": 1618812579578,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://gum.criteo.com/sync?c=327&a=1&r=1&u=https://pulse.delta.com/pc/delta/%3Fcw_criteoid%3D%40USERID%40 - Failed to load resource: net::ERR_CONNECTION_REFUSED",
                "timestamp": 1618812602846,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://www.delta.com/resources/c36db7c71763120c0d0265eb98f27f913a30d77a1d98e 18 Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check https://xhr.spec.whatwg.org/.",
                "timestamp": 1618812604857,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://www.delta.com/resources/c36db7c71763120c0d0265eb98f27f913a30d77a1d98e 18 Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check https://xhr.spec.whatwg.org/.",
                "timestamp": 1618812608500,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://gum.criteo.com/sync?c=327&a=1&r=1&u=https://pulse.delta.com/pc/delta/%3Fcw_criteoid%3D%40USERID%40 - Failed to load resource: net::ERR_CONNECTION_REFUSED",
                "timestamp": 1618812633133,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://www.delta.com/resources/c36db7c71763120c0d0265eb98f27f913a30d77a1d98e 18 Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check https://xhr.spec.whatwg.org/.",
                "timestamp": 1618812634590,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://gum.criteo.com/sync?c=327&a=1&r=1&u=https://pulse.delta.com/pc/delta/%3Fcw_criteoid%3D%40USERID%40 - Failed to load resource: net::ERR_CONNECTION_REFUSED",
                "timestamp": 1618812659412,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00e70084-0065-00ca-008e-009b00450035.png",
        "timestamp": 1618812521655,
        "duration": 139214
    },
    {
        "description": "Assert Multiform|Assert Basic Components",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 10468,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "WARNING",
                "message": "https://www.delta.com/resources/c36db7c71763120c0d0265eb98f27f913a30d77a1d98e 18 Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check https://xhr.spec.whatwg.org/.",
                "timestamp": 1618812662602,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://delta-www.baynote.net/baynote/tags3/common?customerId=delta&code=www&timeout=undefined&onFailure=undefined - Failed to load resource: net::ERR_NAME_NOT_RESOLVED",
                "timestamp": 1618812664174,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://ssp.delta.com/content/dam/delta-www/sorry-server/delta_sorry.html?&q=Coronavirus%27&ct=load&s=&site=delta - Failed to load resource: net::ERR_CERT_COMMON_NAME_INVALID",
                "timestamp": 1618812665219,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618812665738,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618812666091,
                "type": ""
            }
        ],
        "timestamp": 1618812664263,
        "duration": 13966
    },
    {
        "description": "Assert various Multiform|Assert Multiform Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 8484,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1619066399236,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 216:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1619066404731,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00b0004e-0041-001a-0055-0049000f00e6.png",
        "timestamp": 1619066395934,
        "duration": 28803
    },
    {
        "description": "Assert various search boxes and search result|Assert SearchFilter Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 8484,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1619066427131,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 216:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1619066427453,
                "type": ""
            }
        ],
        "screenShotFile": "images\\0094001f-0003-0059-003d-00d400790047.png",
        "timestamp": 1619066425989,
        "duration": 9953
    },
    {
        "description": "Assert various searches and data in WebTable|Assert WebTable Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 8484,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1619066436923,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 216:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1619066437268,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00cd00b1-0009-00c7-007e-00cd009800f5.png",
        "timestamp": 1619066436292,
        "duration": 10428
    },
    {
        "description": "Signin with invalid username and password and assert the error labels|Assert RegistrationLogin Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 8484,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1619066447957,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 216:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1619066448189,
                "type": ""
            }
        ],
        "screenShotFile": "images\\005e00b6-00fe-00db-00a5-0075002900b7.png",
        "timestamp": 1619066447031,
        "duration": 17747
    },
    {
        "description": "Assert login is successful, and assert the labels shown |Assert RegistrationLogin Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 8484,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1619066465740,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 216:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1619066465933,
                "type": ""
            }
        ],
        "screenShotFile": "images\\008c0048-00ca-009f-0042-00d200770033.png",
        "timestamp": 1619066465060,
        "duration": 12722
    },
    {
        "description": "Assert various search boxes and search result|Assert Scrollable Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 8484,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1619066479069,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 216:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1619066479383,
                "type": ""
            }
        ],
        "screenShotFile": "images\\002400ec-005a-00cc-0034-009f00ab004a.png",
        "timestamp": 1619066477995,
        "duration": 5713
    },
    {
        "description": "Assert and upload image|Assert UploadImage Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 8484,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1619066484899,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 216:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1619066485248,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00f50076-0060-003d-0072-00ca00b40020.png",
        "timestamp": 1619066483961,
        "duration": 5209
    },
    {
        "description": "Functionality of Customer Transaction|Functionality of XYZ Bank Customer login",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 8484,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1619066490381,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 216:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1619066490745,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00f40007-001f-00b6-00d5-00b400a40046.png",
        "timestamp": 1619066489579,
        "duration": 12248
    },
    {
        "description": "Functionality of Customer Deposit|Functionality of XYZ Bank Customer login",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 8484,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1619066502537,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 216:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1619066502789,
                "type": ""
            }
        ],
        "screenShotFile": "images\\0067001b-0087-0012-00c1-000700f30027.png",
        "timestamp": 1619066502016,
        "duration": 4561
    },
    {
        "description": "Functionality of Customer Deposit|Functionality of XYZ Bank Customer login",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 8484,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1619066507387,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 216:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1619066507795,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00ff0017-00e4-006c-00fc-000000dc001e.png",
        "timestamp": 1619066506836,
        "duration": 4805
    },
    {
        "description": "click Home Page|XYZ Bank Home Page",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 8484,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1619066512423,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 216:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1619066512657,
                "type": ""
            }
        ],
        "screenShotFile": "images\\004e00e6-00f2-00e8-00dc-00b8001f0036.png",
        "timestamp": 1619066511857,
        "duration": 2117
    },
    {
        "description": "AddCustomer section|click XYZ Bank Manager login",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 8484,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1619066514758,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 216:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1619066514993,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00cd0013-00db-0087-0088-00680066007f.png",
        "timestamp": 1619066514220,
        "duration": 3265
    },
    {
        "description": "OpenAccount section|click XYZ Bank Manager login",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 8484,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1619066518466,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 216:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1619066518776,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00b200ba-004a-001b-001f-0078006b00f6.png",
        "timestamp": 1619066517775,
        "duration": 4003
    },
    {
        "description": "Customers section|click XYZ Bank Manager login",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 8484,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1619066522656,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 216:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1619066522988,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00c000f5-002d-0014-0058-00da009c00eb.png",
        "timestamp": 1619066522086,
        "duration": 3047
    },
    {
        "description": "Valid Consumption Calculations|Assert UploadImage Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 8484,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1619066526153,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 216:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1619066526379,
                "type": ""
            }
        ],
        "screenShotFile": "images\\007b0034-0086-00dd-0089-00bc007600d9.png",
        "timestamp": 1619066525367,
        "duration": 9654
    },
    {
        "description": "Invalid Consumption Calculations|Assert UploadImage Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 8484,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1619066535854,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 216:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1619066536080,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00b8009d-008e-0035-0013-002300ac00be.png",
        "timestamp": 1619066535267,
        "duration": 3080
    },
    {
        "description": "Valid Simple Calculations|Assert UploadImage Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 8484,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1619066539190,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1619066539299,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00ee00c8-004b-0035-00f4-0016009e0045.png",
        "timestamp": 1619066538591,
        "duration": 8060
    },
    {
        "description": "Invalid Simple Calculations|Assert UploadImage Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 8484,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 216:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1619066547998,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00520079-0009-002d-00eb-0098005300d1.png",
        "timestamp": 1619066546900,
        "duration": 3537
    },
    {
        "description": "Assert home page navigation bar|Assert Course selection home Page",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 8484,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://fast.wistia.com/assets/external/E-v1.js 1:17872 \"Failed to execute 'observe' on 'MutationObserver': parameter 1 is not of type 'Node'.\"",
                "timestamp": 1619066572729,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://fast.wistia.com/assets/external/E-v1.js 1:17872 \"TypeError: Failed to execute 'observe' on 'MutationObserver': parameter 1 is not of type 'Node'.\\n    at https://fast.wistia.com/assets/external/E-v1.js:2:296504\\n    at u (https://fast.wistia.com/assets/external/E-v1.js:2:57065)\"",
                "timestamp": 1619066572729,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/visits - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619066573946,
                "type": ""
            }
        ],
        "screenShotFile": "images\\007a0034-0060-00e0-0091-001d00ad0008.png",
        "timestamp": 1619066550618,
        "duration": 82358
    },
    {
        "description": "functionality of home page navigation bar|Assert Course selection home Page",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 8484,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619066648844,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "http://way2automation.com/assets/img/seleniumlogo.jpg - Failed to load resource: net::ERR_CONNECTION_RESET",
                "timestamp": 1619066701918,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "http://way2automation.com/assets/img/seleniumonlinelogo.png - Failed to load resource: net::ERR_CONTENT_LENGTH_MISMATCH",
                "timestamp": 1619066725579,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619066733216,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/sign_in - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619066733216,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://sso.teachable.com/ahoy/visits - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619066734591,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619066746607,
                "type": ""
            }
        ],
        "screenShotFile": "images\\003d0080-00fa-00c2-00f6-000d00660007.png",
        "timestamp": 1619066633534,
        "duration": 113734
    },
    {
        "description": "Print course details|Assert Course selection",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 8484,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619066747705,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/sign_up - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619066748481,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://sso.teachable.com/secure/673/users/sign_up?reset_purchase_session=1 - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619066748710,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "deprecation 3 'window.webkitStorageInfo' is deprecated. Please use 'navigator.webkitTemporaryStorage' or 'navigator.webkitPersistentStorage' instead.",
                "timestamp": 1619066761972,
                "type": ""
            }
        ],
        "screenShotFile": "images\\001b0049-0041-0041-00cd-0017001800c3.png",
        "timestamp": 1619066747544,
        "duration": 34513
    },
    {
        "description": "Print author name in dropdown|Assert Course selection",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 8484,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619066784233,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619066784233,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619066789980,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619066795079,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00ed00d3-00d6-00f8-00f5-0004000e006f.png",
        "timestamp": 1619066782209,
        "duration": 12859
    },
    {
        "description": "Assert all courses by searching protractor|Assert Course selection",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 8484,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619066797747,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619066797770,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619066797947,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619066797947,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619066798920,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619066808555,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619066818913,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619066824000,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619066829090,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619066834420,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00a000cc-0078-00dc-00f6-00fa00040019.png",
        "timestamp": 1619066795248,
        "duration": 39167
    },
    {
        "description": "Assert home page Journey Details|Assert and functionality check of Journey Details",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 8484,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "WARNING",
                "message": "https://www.delta.com/resources/c36db7c71763120c0d0265eb98f27f913a30d77a1d98e 18 Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check https://xhr.spec.whatwg.org/.",
                "timestamp": 1619066839352,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.delta.com/apac/en - Mixed Content: The page at 'https://www.delta.com/apac/en' was loaded over HTTPS, but requested an insecure XMLHttpRequest endpoint 'http://dpm.demdex.net/id/rd?d_visid_ver=2.3.0&d_fieldgroup=MC&d_rtbd=json&d_ver=2&d_verify=1&d_orgid=F0E65E09512D2CC50A490D4D%40AdobeOrg&d_nsid=0&ts=1619066839298'. This request has been blocked; the content must be served over HTTPS.",
                "timestamp": 1619066840053,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://gum.criteo.com/sync?c=327&a=1&r=1&u=https://pulse.delta.com/pc/delta/%3Fcw_criteoid%3D%40USERID%40 - Failed to load resource: net::ERR_CONNECTION_REFUSED",
                "timestamp": 1619066870383,
                "type": ""
            }
        ],
        "screenShotFile": "images\\000e0093-0088-00c9-007e-003d0011009a.png",
        "timestamp": 1619066834615,
        "duration": 36027
    },
    {
        "description": "Assert home page navigation bar|Assert and functionality check of delta navigation bar",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 8484,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "WARNING",
                "message": "https://www.delta.com/resources/c36db7c71763120c0d0265eb98f27f913a30d77a1d98e 18 Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check https://xhr.spec.whatwg.org/.",
                "timestamp": 1619066871863,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://gum.criteo.com/sync?c=327&a=1&r=1&u=https://pulse.delta.com/pc/delta/%3Fcw_criteoid%3D%40USERID%40 - Failed to load resource: net::ERR_CONNECTION_REFUSED",
                "timestamp": 1619066897927,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00360027-0071-0037-00b1-00f6005b0061.png",
        "timestamp": 1619066870805,
        "duration": 27528
    },
    {
        "description": "Functionality of home page navigation bar|Assert and functionality check of delta navigation bar",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 8484,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "WARNING",
                "message": "https://www.delta.com/resources/c36db7c71763120c0d0265eb98f27f913a30d77a1d98e 18 Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check https://xhr.spec.whatwg.org/.",
                "timestamp": 1619066900025,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://gum.criteo.com/sync?c=327&a=1&r=1&u=https://pulse.delta.com/pc/delta/%3Fcw_criteoid%3D%40USERID%40 - Failed to load resource: net::ERR_CONNECTION_REFUSED",
                "timestamp": 1619066925219,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://www.delta.com/resources/c36db7c71763120c0d0265eb98f27f913a30d77a1d98e 18 Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check https://xhr.spec.whatwg.org/.",
                "timestamp": 1619066927305,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://gum.criteo.com/sync?c=327&a=1&r=1&u=https://pulse.delta.com/pc/delta/%3Fcw_criteoid%3D%40USERID%40 - Failed to load resource: net::ERR_CONNECTION_REFUSED",
                "timestamp": 1619066953281,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://www.delta.com/resources/c36db7c71763120c0d0265eb98f27f913a30d77a1d98e 18 Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check https://xhr.spec.whatwg.org/.",
                "timestamp": 1619066962234,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://delta-www.baynote.net/baynote/tags3/common?customerId=delta&code=www&timeout=undefined&onFailure=undefined - Failed to load resource: net::ERR_NAME_NOT_RESOLVED",
                "timestamp": 1619066965040,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://gum.criteo.com/sync?c=327&a=1&r=1&u=https://pulse.delta.com/pc/delta/%3Fcw_criteoid%3D%40USERID%40 - Failed to load resource: net::ERR_CONNECTION_REFUSED",
                "timestamp": 1619066987801,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://www.delta.com/resources/c36db7c71763120c0d0265eb98f27f913a30d77a1d98e 18 Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check https://xhr.spec.whatwg.org/.",
                "timestamp": 1619066994588,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://www.delta.com/resources/c36db7c71763120c0d0265eb98f27f913a30d77a1d98e 18 Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check https://xhr.spec.whatwg.org/.",
                "timestamp": 1619067014225,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://gum.criteo.com/sync?c=327&a=1&r=1&u=https://pulse.delta.com/pc/delta/%3Fcw_criteoid%3D%40USERID%40 - Failed to load resource: net::ERR_CONNECTION_REFUSED",
                "timestamp": 1619067040025,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://www.delta.com/resources/c36db7c71763120c0d0265eb98f27f913a30d77a1d98e 18 Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check https://xhr.spec.whatwg.org/.",
                "timestamp": 1619067041894,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://gum.criteo.com/sync?c=327&a=1&r=1&u=https://pulse.delta.com/pc/delta/%3Fcw_criteoid%3D%40USERID%40 - Failed to load resource: net::ERR_CONNECTION_REFUSED",
                "timestamp": 1619067068193,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00df00c7-002d-007d-0049-00ab004100c9.png",
        "timestamp": 1619066898686,
        "duration": 171274
    },
    {
        "description": "Assert Multiform|Assert Basic Components",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 8484,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "WARNING",
                "message": "https://www.delta.com/resources/c36db7c71763120c0d0265eb98f27f913a30d77a1d98e 18 Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check https://xhr.spec.whatwg.org/.",
                "timestamp": 1619067072841,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://delta-www.baynote.net/baynote/tags3/common?customerId=delta&code=www&timeout=undefined&onFailure=undefined - Failed to load resource: net::ERR_NAME_NOT_RESOLVED",
                "timestamp": 1619067075005,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1619067075830,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 216:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1619067076094,
                "type": ""
            }
        ],
        "timestamp": 1619067074471,
        "duration": 13642
    },
    {
        "description": "Assert various Multiform|Assert Multiform Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 3484,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1619074774120,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 216:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1619074783003,
                "type": ""
            }
        ],
        "screenShotFile": "images\\009600ab-00fc-0057-005a-003f008600d8.png",
        "timestamp": 1619074771117,
        "duration": 31099
    },
    {
        "description": "Assert various search boxes and search result|Assert SearchFilter Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 3484,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1619074803177,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 216:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1619074803338,
                "type": ""
            }
        ],
        "screenShotFile": "images\\006c0049-00ed-009d-00ff-00b8002a0001.png",
        "timestamp": 1619074802629,
        "duration": 7107
    },
    {
        "description": "Assert various searches and data in WebTable|Assert WebTable Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 3484,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1619074810518,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 216:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1619074810652,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00420005-00dd-00da-0048-0086005800e8.png",
        "timestamp": 1619074809900,
        "duration": 5239
    },
    {
        "description": "Signin with invalid username and password and assert the error labels|Assert RegistrationLogin Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 3484,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1619074816261,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 216:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1619074816368,
                "type": ""
            }
        ],
        "screenShotFile": "images\\000e007e-00f9-002d-006a-006400000076.png",
        "timestamp": 1619074815308,
        "duration": 11218
    },
    {
        "description": "Assert login is successful, and assert the labels shown |Assert RegistrationLogin Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 3484,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1619074827585,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 216:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1619074827700,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00ea0004-006b-0079-009a-00d4006400e6.png",
        "timestamp": 1619074826659,
        "duration": 11730
    },
    {
        "description": "Assert various search boxes and search result|Assert Scrollable Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 3484,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1619074839656,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 216:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1619074839825,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00700084-0051-00e1-006e-004b00ca0027.png",
        "timestamp": 1619074838512,
        "duration": 4990
    },
    {
        "description": "Assert and upload image|Assert UploadImage Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 3484,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1619074844617,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 216:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1619074844732,
                "type": ""
            }
        ],
        "screenShotFile": "images\\005c0013-00e2-0073-0084-0063006400d4.png",
        "timestamp": 1619074843630,
        "duration": 4901
    },
    {
        "description": "Functionality of Customer Transaction|Functionality of XYZ Bank Customer login",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 3484,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1619074850037,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1619074850102,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00180010-005f-00c5-003a-00bd00f50000.png",
        "timestamp": 1619074848717,
        "duration": 10975
    },
    {
        "description": "Functionality of Customer Deposit|Functionality of XYZ Bank Customer login",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 3484,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1619074860837,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 216:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1619074860997,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00ec006d-00d3-00ba-007f-003200b6000c.png",
        "timestamp": 1619074859797,
        "duration": 3137
    },
    {
        "description": "Functionality of Customer Deposit|Functionality of XYZ Bank Customer login",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 3484,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1619074864260,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 216:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1619074864439,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00f100a2-0032-00b2-009b-009500c30021.png",
        "timestamp": 1619074863069,
        "duration": 4514
    },
    {
        "description": "click Home Page|XYZ Bank Home Page",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 3484,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1619074868409,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 216:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1619074868576,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00a2000b-003b-007f-003b-00a700f0008b.png",
        "timestamp": 1619074867702,
        "duration": 1938
    },
    {
        "description": "AddCustomer section|click XYZ Bank Manager login",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 3484,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1619074870258,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 216:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1619074870414,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00a00005-0029-0041-00cc-00fb00d10083.png",
        "timestamp": 1619074869761,
        "duration": 2982
    },
    {
        "description": "OpenAccount section|click XYZ Bank Manager login",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 3484,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1619074874002,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1619074874074,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/angularjs-protractor-practice-site/ - Access to XMLHttpRequest at 'https://partner.googleadservices.com/gampad/cookie.js?domain=www.globalsqa.com&client=ca-pub-2878895907861435&cookie=ID=1b269c706616bb83-22b42b8482c70023:T=1619074787:RT=1619074787:S=ALNI_MZkwERxWOU79QNQbv_lBuLyyXUy8Q' from origin 'https://www.globalsqa.com' has been blocked by CORS policy: The 'Access-Control-Allow-Origin' header contains the invalid value 'www.globalsqa.com'.",
                "timestamp": 1619074875113,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/r20210420/r20190131/show_ads_impl_fy2019.js 251:409 Uncaught Error: XHR error: https://partner.googleadservices.com/ga…T=1619074787:S=ALNI_MZkwERxWOU79QNQbv_lBuLyyXUy8Q",
                "timestamp": 1619074875116,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://partner.googleadservices.com/gampad/cookie.js?domain=www.globalsqa.com&client=ca-pub-2878895907861435&cookie=ID=1b269c706616bb83-22b42b8482c70023:T=1619074787:RT=1619074787:S=ALNI_MZkwERxWOU79QNQbv_lBuLyyXUy8Q - Failed to load resource: net::ERR_FAILED",
                "timestamp": 1619074875116,
                "type": ""
            }
        ],
        "screenShotFile": "images\\008b0026-00f6-0033-0022-00e3003400c0.png",
        "timestamp": 1619074872902,
        "duration": 3391
    },
    {
        "description": "Customers section|click XYZ Bank Manager login",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 3484,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1619074877142,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 216:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1619074877311,
                "type": ""
            }
        ],
        "screenShotFile": "images\\008a009d-008b-0032-0086-00d300050066.png",
        "timestamp": 1619074876415,
        "duration": 3442
    },
    {
        "description": "Valid Consumption Calculations|Assert UploadImage Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 3484,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1619074880839,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1619074880906,
                "type": ""
            }
        ],
        "screenShotFile": "images\\0034001d-0023-0069-00ec-00da00dc002a.png",
        "timestamp": 1619074879965,
        "duration": 6851
    },
    {
        "description": "Invalid Consumption Calculations|Assert UploadImage Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 3484,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1619074888324,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 216:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1619074888483,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00e300fc-00d6-0042-00a1-00bf00a000eb.png",
        "timestamp": 1619074886918,
        "duration": 2891
    },
    {
        "description": "Valid Simple Calculations|Assert UploadImage Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 3484,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1619074891071,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 216:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1619074891194,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00a80015-00a8-0069-0062-00f800120008.png",
        "timestamp": 1619074889964,
        "duration": 4859
    },
    {
        "description": "Invalid Simple Calculations|Assert UploadImage Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 3484,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1619074896026,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 216:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1619074896191,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00380070-009d-00b1-0050-000f005e0056.png",
        "timestamp": 1619074894920,
        "duration": 2342
    },
    {
        "description": "Assert home page navigation bar|Assert Course selection home Page",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 3484,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/visits - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619074903357,
                "type": ""
            }
        ],
        "screenShotFile": "images\\003c002f-009d-002e-0026-006c009f00f7.png",
        "timestamp": 1619074897417,
        "duration": 31874
    },
    {
        "description": "functionality of home page navigation bar|Assert Course selection home Page",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 3484,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619074931636,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619074933075,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619074984492,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619074984499,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619074990167,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/sign_in - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619074990169,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://sso.teachable.com/ahoy/visits - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619074993079,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619075001238,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619075001239,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619075001240,
                "type": ""
            }
        ],
        "screenShotFile": "images\\0024007f-0000-0042-00ba-004200e50082.png",
        "timestamp": 1619074929535,
        "duration": 72321
    },
    {
        "description": "Print course details|Assert Course selection",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 3484,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619075002354,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/sign_up - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619075003084,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://sso.teachable.com/secure/673/users/sign_up?reset_purchase_session=1 - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619075003249,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "deprecation 3 'window.webkitStorageInfo' is deprecated. Please use 'navigator.webkitTemporaryStorage' or 'navigator.webkitPersistentStorage' instead.",
                "timestamp": 1619075013866,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00f0009c-0078-00e9-0019-008800990069.png",
        "timestamp": 1619075002116,
        "duration": 31899
    },
    {
        "description": "Print author name in dropdown|Assert Course selection",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 3484,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619075036115,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619075036116,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619075036120,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619075036122,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619075041894,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619075041894,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00890087-006e-003e-0023-001800b000bc.png",
        "timestamp": 1619075034144,
        "duration": 12823
    },
    {
        "description": "Assert all courses by searching protractor|Assert Course selection",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 3484,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619075049061,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619075049093,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619075049128,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619075049204,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619075049246,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619075049288,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619075050175,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619075056535,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619075061625,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619075069187,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619075074322,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619075079449,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619075084707,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00d3002b-0064-0010-000d-0097007100b7.png",
        "timestamp": 1619075047175,
        "duration": 37529
    },
    {
        "description": "Assert home page Journey Details|Assert and functionality check of Journey Details",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 3484,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "WARNING",
                "message": "https://www.delta.com/resources/c36db7c71763120c0d0265eb98f27f913a30d77a1d98e 18 Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check https://xhr.spec.whatwg.org/.",
                "timestamp": 1619075093827,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.delta.com/apac/en - Mixed Content: The page at 'https://www.delta.com/apac/en' was loaded over HTTPS, but requested an insecure XMLHttpRequest endpoint 'http://dpm.demdex.net/id/rd?d_visid_ver=2.3.0&d_fieldgroup=MC&d_rtbd=json&d_ver=2&d_verify=1&d_orgid=F0E65E09512D2CC50A490D4D%40AdobeOrg&d_nsid=0&ts=1619075093782'. This request has been blocked; the content must be served over HTTPS.",
                "timestamp": 1619075095794,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://gum.criteo.com/sync?c=327&a=1&r=1&u=https://pulse.delta.com/pc/delta/%3Fcw_criteoid%3D%40USERID%40 - Failed to load resource: net::ERR_CONNECTION_REFUSED",
                "timestamp": 1619075137517,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00d3001d-008f-00e1-00c0-001b00900019.png",
        "timestamp": 1619075084932,
        "duration": 52764
    },
    {
        "description": "Assert home page navigation bar|Assert and functionality check of delta navigation bar",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 3484,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "WARNING",
                "message": "https://www.delta.com/resources/c36db7c71763120c0d0265eb98f27f913a30d77a1d98e 18 Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check https://xhr.spec.whatwg.org/.",
                "timestamp": 1619075142519,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://gum.criteo.com/sync?c=327&a=1&r=1&u=https://pulse.delta.com/pc/delta/%3Fcw_criteoid%3D%40USERID%40 - Failed to load resource: net::ERR_CONNECTION_REFUSED",
                "timestamp": 1619075168531,
                "type": ""
            }
        ],
        "screenShotFile": "images\\001800c4-0037-0010-005f-0071000900c3.png",
        "timestamp": 1619075137841,
        "duration": 31031
    },
    {
        "description": "Functionality of home page navigation bar|Assert and functionality check of delta navigation bar",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 3484,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "WARNING",
                "message": "https://www.delta.com/resources/c36db7c71763120c0d0265eb98f27f913a30d77a1d98e 18 Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check https://xhr.spec.whatwg.org/.",
                "timestamp": 1619075170333,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://gum.criteo.com/sync?c=327&a=1&r=1&u=https://pulse.delta.com/pc/delta/%3Fcw_criteoid%3D%40USERID%40 - Failed to load resource: net::ERR_CONNECTION_REFUSED",
                "timestamp": 1619075195959,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://www.delta.com/resources/c36db7c71763120c0d0265eb98f27f913a30d77a1d98e 18 Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check https://xhr.spec.whatwg.org/.",
                "timestamp": 1619075197470,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://gum.criteo.com/sync?c=327&a=1&r=1&u=https://pulse.delta.com/pc/delta/%3Fcw_criteoid%3D%40USERID%40 - Failed to load resource: net::ERR_CONNECTION_TIMED_OUT",
                "timestamp": 1619075223856,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://www.delta.com/resources/c36db7c71763120c0d0265eb98f27f913a30d77a1d98e 18 Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check https://xhr.spec.whatwg.org/.",
                "timestamp": 1619075230094,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://delta-www.baynote.net/baynote/tags3/common?customerId=delta&code=www&timeout=undefined&onFailure=undefined - Failed to load resource: net::ERR_NAME_NOT_RESOLVED",
                "timestamp": 1619075232729,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://gum.criteo.com/sync?c=327&a=1&r=1&u=https://pulse.delta.com/pc/delta/%3Fcw_criteoid%3D%40USERID%40 - Failed to load resource: net::ERR_CONNECTION_REFUSED",
                "timestamp": 1619075257001,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://www.delta.com/resources/c36db7c71763120c0d0265eb98f27f913a30d77a1d98e 18 Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check https://xhr.spec.whatwg.org/.",
                "timestamp": 1619075260288,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://www.delta.com/resources/c36db7c71763120c0d0265eb98f27f913a30d77a1d98e 18 Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check https://xhr.spec.whatwg.org/.",
                "timestamp": 1619075267619,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://gum.criteo.com/sync?c=327&a=1&r=1&u=https://pulse.delta.com/pc/delta/%3Fcw_criteoid%3D%40USERID%40 - Failed to load resource: net::ERR_CONNECTION_REFUSED",
                "timestamp": 1619075293290,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://www.delta.com/resources/c36db7c71763120c0d0265eb98f27f913a30d77a1d98e 18 Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check https://xhr.spec.whatwg.org/.",
                "timestamp": 1619075295966,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://gum.criteo.com/sync?c=327&a=1&r=1&u=https://pulse.delta.com/pc/delta/%3Fcw_criteoid%3D%40USERID%40 - Failed to load resource: net::ERR_CONNECTION_TIMED_OUT",
                "timestamp": 1619075322144,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00aa00b3-008c-0053-00f4-00a500cf002e.png",
        "timestamp": 1619075169033,
        "duration": 154440
    },
    {
        "description": "Assert Multiform|Assert Basic Components",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 3484,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "WARNING",
                "message": "https://www.delta.com/resources/c36db7c71763120c0d0265eb98f27f913a30d77a1d98e 18 Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check https://xhr.spec.whatwg.org/.",
                "timestamp": 1619075326059,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://delta-www.baynote.net/baynote/tags3/common?customerId=delta&code=www&timeout=undefined&onFailure=undefined - Failed to load resource: net::ERR_NAME_NOT_RESOLVED",
                "timestamp": 1619075328807,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1619075329446,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 216:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1619075329672,
                "type": ""
            }
        ],
        "timestamp": 1619075327896,
        "duration": 14329
    },
    {
        "description": "Assert various Multiform|Assert Multiform Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 6060,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1619075353051,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 216:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1619075357390,
                "type": ""
            }
        ],
        "screenShotFile": "images\\0009001b-0099-00fc-00ec-00c50041005d.png",
        "timestamp": 1619075351308,
        "duration": 21611
    },
    {
        "description": "Assert various search boxes and search result|Assert SearchFilter Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 6060,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1619075373830,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 216:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1619075374041,
                "type": ""
            }
        ],
        "screenShotFile": "images\\003f00c7-0022-0019-007c-00a50080001a.png",
        "timestamp": 1619075373279,
        "duration": 6561
    },
    {
        "description": "Assert various searches and data in WebTable|Assert WebTable Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 6060,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 216:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1619075380638,
                "type": ""
            }
        ],
        "screenShotFile": "images\\0026008c-0035-0004-0076-001500a200ee.png",
        "timestamp": 1619075380048,
        "duration": 5186
    },
    {
        "description": "Signin with invalid username and password and assert the error labels|Assert RegistrationLogin Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 6060,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 216:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1619075386305,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00fe009f-0063-00ac-00f0-000900ad00d6.png",
        "timestamp": 1619075385354,
        "duration": 11473
    },
    {
        "description": "Assert login is successful, and assert the labels shown |Assert RegistrationLogin Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 6060,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 216:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1619075397488,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00500041-006f-003f-0001-002b00bb00d8.png",
        "timestamp": 1619075396921,
        "duration": 9796
    },
    {
        "description": "Assert various search boxes and search result|Assert Scrollable Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 6060,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1619075407327,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 216:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1619075407482,
                "type": ""
            }
        ],
        "screenShotFile": "images\\0075008c-00e9-002a-0093-0094006a003e.png",
        "timestamp": 1619075406834,
        "duration": 3875
    },
    {
        "description": "Assert and upload image|Assert UploadImage Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 6060,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 216:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1619075412383,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00f00077-00fe-0028-0049-009c00600061.png",
        "timestamp": 1619075410845,
        "duration": 4284
    },
    {
        "description": "Functionality of Customer Transaction|Functionality of XYZ Bank Customer login",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 6060,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 216:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1619075415891,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00cb003c-0042-0004-00ca-00d300b700d0.png",
        "timestamp": 1619075415295,
        "duration": 7388
    },
    {
        "description": "Functionality of Customer Deposit|Functionality of XYZ Bank Customer login",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 6060,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1619075423368,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 216:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1619075423538,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00590028-00c8-0035-0087-0024002f004b.png",
        "timestamp": 1619075422793,
        "duration": 2632
    },
    {
        "description": "Functionality of Customer Deposit|Functionality of XYZ Bank Customer login",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 6060,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 216:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1619075426328,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00eb0024-0065-0011-00d0-003400da00f3.png",
        "timestamp": 1619075425580,
        "duration": 3061
    },
    {
        "description": "click Home Page|XYZ Bank Home Page",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 6060,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1619075429355,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 216:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1619075429507,
                "type": ""
            }
        ],
        "screenShotFile": "images\\0010000e-00e7-000f-00fd-0076009300aa.png",
        "timestamp": 1619075428778,
        "duration": 1476
    },
    {
        "description": "AddCustomer section|click XYZ Bank Manager login",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 6060,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1619075430925,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 216:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1619075431084,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00c50045-001c-0031-009f-0011008f00aa.png",
        "timestamp": 1619075430380,
        "duration": 2435
    },
    {
        "description": "OpenAccount section|click XYZ Bank Manager login",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 6060,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 216:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1619075433701,
                "type": ""
            }
        ],
        "screenShotFile": "images\\0086003d-00e4-00be-0068-007b00ec00c3.png",
        "timestamp": 1619075432959,
        "duration": 2485
    },
    {
        "description": "Customers section|click XYZ Bank Manager login",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 6060,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1619075436176,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 216:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1619075436332,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00c3000a-0042-0037-00b1-0089001800c1.png",
        "timestamp": 1619075435583,
        "duration": 2390
    },
    {
        "description": "Valid Consumption Calculations|Assert UploadImage Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 6060,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 216:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1619075438784,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00c1002c-00a3-0096-00c3-006300a10039.png",
        "timestamp": 1619075438098,
        "duration": 5039
    },
    {
        "description": "Invalid Consumption Calculations|Assert UploadImage Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 6060,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1619075444107,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1619075444140,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00b300a0-0050-0023-0048-006700b00001.png",
        "timestamp": 1619075443252,
        "duration": 2263
    },
    {
        "description": "Valid Simple Calculations|Assert UploadImage Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 6060,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1619075446472,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1619075446517,
                "type": ""
            }
        ],
        "screenShotFile": "images\\0054002d-00c6-0000-0089-008000760061.png",
        "timestamp": 1619075445642,
        "duration": 4868
    },
    {
        "description": "Invalid Simple Calculations|Assert UploadImage Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 6060,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1619075451390,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 216:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1619075451557,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00eb004d-0050-00f1-002d-009600460073.png",
        "timestamp": 1619075450658,
        "duration": 1953
    },
    {
        "description": "Assert home page navigation bar|Assert Course selection home Page",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 6060,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/visits - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619075463649,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00410069-0085-0035-00cc-0024005500d2.png",
        "timestamp": 1619075452737,
        "duration": 73071
    },
    {
        "description": "functionality of home page navigation bar|Assert Course selection home Page",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 6060,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619075527747,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619075615822,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/sign_in - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619075620978,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://sso.teachable.com/ahoy/visits - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619075626213,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619075637447,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00ad0069-002e-0031-00ab-0034003300c3.png",
        "timestamp": 1619075526057,
        "duration": 111981
    },
    {
        "description": "Print course details|Assert Course selection",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 6060,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619075638562,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/sign_up - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619075639470,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://sso.teachable.com/secure/673/users/sign_up?reset_purchase_session=1 - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619075639683,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "deprecation 3 'window.webkitStorageInfo' is deprecated. Please use 'navigator.webkitTemporaryStorage' or 'navigator.webkitPersistentStorage' instead.",
                "timestamp": 1619075650325,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00840085-00d2-000b-00af-000500440048.png",
        "timestamp": 1619075638291,
        "duration": 32150
    },
    {
        "description": "Print author name in dropdown|Assert Course selection",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 6060,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619075673116,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619075673117,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619075679002,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619075679002,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00ad00c9-002a-0017-00de-005600f20059.png",
        "timestamp": 1619075670626,
        "duration": 13477
    },
    {
        "description": "Assert all courses by searching protractor|Assert Course selection",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 6060,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619075688420,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619075689800,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619075690415,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619075690456,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619075690674,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619075698166,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619075703269,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619075711044,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619075716151,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619075721230,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619075726607,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00a100cf-006e-002d-0018-00db008900ec.png",
        "timestamp": 1619075684328,
        "duration": 42279
    },
    {
        "description": "Assert home page Journey Details|Assert and functionality check of Journey Details",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 6060,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "WARNING",
                "message": "https://www.delta.com/resources/c36db7c71763120c0d0265eb98f27f913a30d77a1d98e 18 Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check https://xhr.spec.whatwg.org/.",
                "timestamp": 1619075735150,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.delta.com/apac/en - Mixed Content: The page at 'https://www.delta.com/apac/en' was loaded over HTTPS, but requested an insecure XMLHttpRequest endpoint 'http://dpm.demdex.net/id/rd?d_visid_ver=2.3.0&d_fieldgroup=MC&d_rtbd=json&d_ver=2&d_verify=1&d_orgid=F0E65E09512D2CC50A490D4D%40AdobeOrg&d_nsid=0&ts=1619075735110'. This request has been blocked; the content must be served over HTTPS.",
                "timestamp": 1619075737526,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://gum.criteo.com/sync?c=327&a=1&r=1&u=https://pulse.delta.com/pc/delta/%3Fcw_criteoid%3D%40USERID%40 - Failed to load resource: net::ERR_CONNECTION_REFUSED",
                "timestamp": 1619075772969,
                "type": ""
            }
        ],
        "screenShotFile": "images\\000a00d6-001e-0058-000f-002c00010032.png",
        "timestamp": 1619075726822,
        "duration": 46366
    },
    {
        "description": "Assert home page navigation bar|Assert and functionality check of delta navigation bar",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 6060,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "WARNING",
                "message": "https://www.delta.com/resources/c36db7c71763120c0d0265eb98f27f913a30d77a1d98e 18 Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check https://xhr.spec.whatwg.org/.",
                "timestamp": 1619075776522,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://gum.criteo.com/sync?c=327&a=1&r=1&u=https://pulse.delta.com/pc/delta/%3Fcw_criteoid%3D%40USERID%40 - Failed to load resource: net::ERR_CONNECTION_REFUSED",
                "timestamp": 1619075802427,
                "type": ""
            }
        ],
        "screenShotFile": "images\\001c0030-0029-00a0-0094-00c600510078.png",
        "timestamp": 1619075773356,
        "duration": 29421
    },
    {
        "description": "Functionality of home page navigation bar|Assert and functionality check of delta navigation bar",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 6060,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "WARNING",
                "message": "https://www.delta.com/resources/c36db7c71763120c0d0265eb98f27f913a30d77a1d98e 18 Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check https://xhr.spec.whatwg.org/.",
                "timestamp": 1619075804240,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://gum.criteo.com/sync?c=327&a=1&r=1&u=https://pulse.delta.com/pc/delta/%3Fcw_criteoid%3D%40USERID%40 - Failed to load resource: net::ERR_CONNECTION_REFUSED",
                "timestamp": 1619075829918,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://www.delta.com/resources/c36db7c71763120c0d0265eb98f27f913a30d77a1d98e 18 Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check https://xhr.spec.whatwg.org/.",
                "timestamp": 1619075832188,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://gum.criteo.com/sync?c=327&a=1&r=1&u=https://pulse.delta.com/pc/delta/%3Fcw_criteoid%3D%40USERID%40 - Failed to load resource: net::ERR_CONNECTION_REFUSED",
                "timestamp": 1619075858006,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.google.co.in/pagead/1p-user-list/1072374139/?guid=ON&script=0&data=medallion_status=;fare_class=;origin=;destination=;departure_date=;return_date=;pagetype=allpages;CabinType=&is_vtc=1&random=483998927&ipr=y - Failed to load resource: net::ERR_CONNECTION_CLOSED",
                "timestamp": 1619075860331,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://www.delta.com/resources/c36db7c71763120c0d0265eb98f27f913a30d77a1d98e 18 Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check https://xhr.spec.whatwg.org/.",
                "timestamp": 1619075863599,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://delta-www.baynote.net/baynote/tags3/common?customerId=delta&code=www&timeout=undefined&onFailure=undefined - Failed to load resource: net::ERR_NAME_NOT_RESOLVED",
                "timestamp": 1619075864990,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://gum.criteo.com/sync?c=327&a=1&r=1&u=https://pulse.delta.com/pc/delta/%3Fcw_criteoid%3D%40USERID%40 - Failed to load resource: net::ERR_CONNECTION_REFUSED",
                "timestamp": 1619075889476,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://www.delta.com/resources/c36db7c71763120c0d0265eb98f27f913a30d77a1d98e 18 Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check https://xhr.spec.whatwg.org/.",
                "timestamp": 1619075893288,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://www.delta.com/resources/c36db7c71763120c0d0265eb98f27f913a30d77a1d98e 18 Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check https://xhr.spec.whatwg.org/.",
                "timestamp": 1619075903363,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://gum.criteo.com/sync?c=327&a=1&r=1&u=https://pulse.delta.com/pc/delta/%3Fcw_criteoid%3D%40USERID%40 - Failed to load resource: net::ERR_CONNECTION_REFUSED",
                "timestamp": 1619075929454,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://www.delta.com/resources/c36db7c71763120c0d0265eb98f27f913a30d77a1d98e 18 Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check https://xhr.spec.whatwg.org/.",
                "timestamp": 1619075931132,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://gum.criteo.com/sync?c=327&a=1&r=1&u=https://pulse.delta.com/pc/delta/%3Fcw_criteoid%3D%40USERID%40 - Failed to load resource: net::ERR_CONNECTION_REFUSED",
                "timestamp": 1619075956716,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00070034-0073-00e5-0004-008200c40067.png",
        "timestamp": 1619075803035,
        "duration": 155242
    },
    {
        "description": "Assert Multiform|Assert Basic Components",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 6060,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "WARNING",
                "message": "https://www.delta.com/resources/c36db7c71763120c0d0265eb98f27f913a30d77a1d98e 18 Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check https://xhr.spec.whatwg.org/.",
                "timestamp": 1619075961830,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://delta-www.baynote.net/baynote/tags3/common?customerId=delta&code=www&timeout=undefined&onFailure=undefined - Failed to load resource: net::ERR_NAME_NOT_RESOLVED",
                "timestamp": 1619075963583,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1619075964571,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 216:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1619075964783,
                "type": ""
            }
        ],
        "timestamp": 1619075963332,
        "duration": 14134
    },
    {
        "description": "Assert various Multiform|Assert Multiform Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 6532,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1619153953923,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 216:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1619153958543,
                "type": ""
            }
        ],
        "screenShotFile": "images\\005200fe-0041-00c0-00bb-0072003f0074.png",
        "timestamp": 1619153951306,
        "duration": 22414
    },
    {
        "description": "Assert various search boxes and search result|Assert SearchFilter Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 6532,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1619153974509,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 216:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1619153974748,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00da0030-00a2-00e7-00a0-002500280078.png",
        "timestamp": 1619153974400,
        "duration": 4590
    },
    {
        "description": "Assert various searches and data in WebTable|Assert WebTable Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 6532,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 216:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1619153979328,
                "type": ""
            }
        ],
        "screenShotFile": "images\\006b0043-00e3-0099-0029-005c002d006a.png",
        "timestamp": 1619153979142,
        "duration": 5058
    },
    {
        "description": "Signin with invalid username and password and assert the error labels|Assert RegistrationLogin Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 6532,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 216:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1619153984526,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00ed00ac-008e-006d-00ab-003400ae000b.png",
        "timestamp": 1619153984336,
        "duration": 10907
    },
    {
        "description": "Assert login is successful, and assert the labels shown |Assert RegistrationLogin Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 6532,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1619153995458,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 216:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1619153995613,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00990057-002d-005c-003c-004600920029.png",
        "timestamp": 1619153995343,
        "duration": 9592
    },
    {
        "description": "Assert various search boxes and search result|Assert Scrollable Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 6532,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 216:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1619154005260,
                "type": ""
            }
        ],
        "screenShotFile": "images\\000b0004-00ba-00fe-000b-00a400e200d3.png",
        "timestamp": 1619154005056,
        "duration": 2717
    },
    {
        "description": "Assert and upload image|Assert UploadImage Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 6532,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 216:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1619154008134,
                "type": ""
            }
        ],
        "screenShotFile": "images\\003600c3-0085-00b9-005c-00db003a0057.png",
        "timestamp": 1619154007942,
        "duration": 2962
    },
    {
        "description": "Functionality of Customer Transaction|Functionality of XYZ Bank Customer login",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 6532,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 216:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1619154011334,
                "type": ""
            }
        ],
        "screenShotFile": "images\\007f0061-004b-00fb-00b4-006600630028.png",
        "timestamp": 1619154011115,
        "duration": 8238
    },
    {
        "description": "Functionality of Customer Deposit|Functionality of XYZ Bank Customer login",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 6532,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1619154019620,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 216:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1619154019839,
                "type": ""
            }
        ],
        "screenShotFile": "images\\0087009e-0084-005d-00ed-009c0026000e.png",
        "timestamp": 1619154019497,
        "duration": 3035
    },
    {
        "description": "Functionality of Customer Deposit|Functionality of XYZ Bank Customer login",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 6532,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1619154022795,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 216:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1619154022958,
                "type": ""
            }
        ],
        "screenShotFile": "images\\009400a1-0070-0099-008f-004f00ad003a.png",
        "timestamp": 1619154022661,
        "duration": 3533
    },
    {
        "description": "click Home Page|XYZ Bank Home Page",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 6532,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1619154026452,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 216:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1619154026692,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00a700a5-009c-00a5-0089-0005000400ac.png",
        "timestamp": 1619154026319,
        "duration": 4861
    },
    {
        "description": "AddCustomer section|click XYZ Bank Manager login",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 6532,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1619154031445,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 216:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1619154031608,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00f200be-0073-0002-0036-009b00650050.png",
        "timestamp": 1619154031323,
        "duration": 5372
    },
    {
        "description": "OpenAccount section|click XYZ Bank Manager login",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 6532,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1619154037044,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 216:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1619154037309,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00100072-0008-0068-0080-00df0064002a.png",
        "timestamp": 1619154036887,
        "duration": 2820
    },
    {
        "description": "Customers section|click XYZ Bank Manager login",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 6532,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 216:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1619154040156,
                "type": ""
            }
        ],
        "screenShotFile": "images\\002b00b6-00af-0088-0020-00270008001a.png",
        "timestamp": 1619154039909,
        "duration": 1728
    },
    {
        "description": "Valid Consumption Calculations|Assert UploadImage Section",
        "passed": false,
        "pending": false,
        "os": "Windows",
        "instanceId": 6532,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": [
            "Expected '' to equal 'Angular Consumption Calculator'.",
            "Expected '' to equal 'Today,'.",
            "Failed: element not interactable\n  (Session info: chrome=90.0.4430.72)\n  (Driver info: chromedriver=90.0.4430.24 (4c6d850f087da467d926e8eddb76550aed655991-refs/branch-heads/4430@{#429}),platform=Windows NT 10.0.19042 x86_64)"
        ],
        "trace": [
            "Error: Failed expectation\n    at UserContext.<anonymous> (C:\\Users\\Jasvinder Singh\\Documents\\Project\\Test Cases\\Small Projects_spec\\ConsumptionCalculator_Spec.js:33:61)\n    at C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasminewd2\\index.js:112:25\n    at new ManagedPromise (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:1077:7)\n    at ControlFlow.promise (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:2505:12)\n    at schedulerExecute (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasminewd2\\index.js:95:18)\n    at TaskQueue.execute_ (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:3084:14)\n    at TaskQueue.executeNext_ (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:3067:27)\n    at C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:2974:25\n    at C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:668:7",
            "Error: Failed expectation\n    at UserContext.<anonymous> (C:\\Users\\Jasvinder Singh\\Documents\\Project\\Test Cases\\Small Projects_spec\\ConsumptionCalculator_Spec.js:36:58)\n    at C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasminewd2\\index.js:112:25\n    at new ManagedPromise (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:1077:7)\n    at ControlFlow.promise (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:2505:12)\n    at schedulerExecute (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasminewd2\\index.js:95:18)\n    at TaskQueue.execute_ (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:3084:14)\n    at TaskQueue.executeNext_ (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:3067:27)\n    at C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:2974:25\n    at C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:668:7",
            "WebDriverError: element not interactable\n  (Session info: chrome=90.0.4430.72)\n  (Driver info: chromedriver=90.0.4430.24 (4c6d850f087da467d926e8eddb76550aed655991-refs/branch-heads/4430@{#429}),platform=Windows NT 10.0.19042 x86_64)\n    at Object.checkLegacyResponse (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\error.js:546:15)\n    at parseHttpResponse (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\http.js:509:13)\n    at C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\http.js:441:30\n    at runMicrotasks (<anonymous>)\n    at processTicksAndRejections (internal/process/task_queues.js:93:5)\nFrom: Task: WebElement.sendKeys()\n    at Driver.schedule (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\webdriver.js:807:17)\n    at WebElement.schedule_ (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\webdriver.js:2010:25)\n    at WebElement.sendKeys (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\webdriver.js:2174:19)\n    at actionFn (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\built\\element.js:89:44)\n    at Array.map (<anonymous>)\n    at C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\built\\element.js:461:65\n    at ManagedPromise.invokeCallback_ (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:1376:14)\n    at TaskQueue.execute_ (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:3084:14)\n    at TaskQueue.executeNext_ (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:3067:27)\n    at C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:2927:27Error\n    at ElementArrayFinder.applyAction_ (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\built\\element.js:459:27)\n    at ElementArrayFinder.<computed> [as sendKeys] (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\built\\element.js:91:29)\n    at ElementFinder.<computed> [as sendKeys] (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\built\\element.js:831:22)\n    at UserContext.<anonymous> (C:\\Users\\Jasvinder Singh\\Documents\\Project\\Test Cases\\Small Projects_spec\\ConsumptionCalculator_Spec.js:48:43)\n    at C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasminewd2\\index.js:112:25\n    at new ManagedPromise (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:1077:7)\n    at ControlFlow.promise (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:2505:12)\n    at schedulerExecute (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasminewd2\\index.js:95:18)\n    at TaskQueue.execute_ (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:3084:14)\n    at TaskQueue.executeNext_ (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:3067:27)\nFrom: Task: Run it(\"Valid Consumption Calculations\") in control flow\n    at UserContext.<anonymous> (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasminewd2\\index.js:94:19)\n    at attempt (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:4297:26)\n    at QueueRunner.run (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:4217:20)\n    at runNext (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:4257:20)\n    at C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:4264:13\n    at C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:4172:9\n    at C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasminewd2\\index.js:64:48\n    at ControlFlow.emit (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\events.js:62:21)\n    at ControlFlow.shutdown_ (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:2674:10)\n    at C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:2599:53\nFrom asynchronous test: \nError\n    at Suite.<anonymous> (C:\\Users\\Jasvinder Singh\\Documents\\Project\\Test Cases\\Small Projects_spec\\ConsumptionCalculator_Spec.js:45:5)\n    at addSpecsToSuite (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:1107:25)\n    at Env.describe (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:1074:7)\n    at describe (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:4399:18)\n    at Object.<anonymous> (C:\\Users\\Jasvinder Singh\\Documents\\Project\\Test Cases\\Small Projects_spec\\ConsumptionCalculator_Spec.js:6:1)\n    at Module._compile (internal/modules/cjs/loader.js:1063:30)\n    at Object.Module._extensions..js (internal/modules/cjs/loader.js:1092:10)\n    at Module.load (internal/modules/cjs/loader.js:928:32)\n    at Function.Module._load (internal/modules/cjs/loader.js:769:14)"
        ],
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1619154041936,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 216:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1619154042192,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://cdnjs.cloudflare.com/ajax/libs/coffee-script/1.6.3/coffee-script.min.js - Failed to load resource: net::ERR_CONNECTION_CLOSED",
                "timestamp": 1619154043683,
                "type": ""
            }
        ],
        "screenShotFile": "images\\003e00a2-0005-00c7-0003-00ab009700f5.png",
        "timestamp": 1619154041795,
        "duration": 4431
    },
    {
        "description": "Invalid Consumption Calculations|Assert UploadImage Section",
        "passed": false,
        "pending": false,
        "os": "Windows",
        "instanceId": 6532,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": [
            "Expected '' to equal 'Angular Consumption Calculator'.",
            "Expected '' to equal 'Today,'.",
            "Failed: element not interactable\n  (Session info: chrome=90.0.4430.72)\n  (Driver info: chromedriver=90.0.4430.24 (4c6d850f087da467d926e8eddb76550aed655991-refs/branch-heads/4430@{#429}),platform=Windows NT 10.0.19042 x86_64)"
        ],
        "trace": [
            "Error: Failed expectation\n    at UserContext.<anonymous> (C:\\Users\\Jasvinder Singh\\Documents\\Project\\Test Cases\\Small Projects_spec\\ConsumptionCalculator_Spec.js:33:61)\n    at C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasminewd2\\index.js:112:25\n    at new ManagedPromise (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:1077:7)\n    at ControlFlow.promise (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:2505:12)\n    at schedulerExecute (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasminewd2\\index.js:95:18)\n    at TaskQueue.execute_ (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:3084:14)\n    at TaskQueue.executeNext_ (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:3067:27)\n    at C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:2974:25\n    at C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:668:7",
            "Error: Failed expectation\n    at UserContext.<anonymous> (C:\\Users\\Jasvinder Singh\\Documents\\Project\\Test Cases\\Small Projects_spec\\ConsumptionCalculator_Spec.js:36:58)\n    at C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasminewd2\\index.js:112:25\n    at new ManagedPromise (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:1077:7)\n    at ControlFlow.promise (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:2505:12)\n    at schedulerExecute (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasminewd2\\index.js:95:18)\n    at TaskQueue.execute_ (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:3084:14)\n    at TaskQueue.executeNext_ (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:3067:27)\n    at C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:2974:25\n    at C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:668:7",
            "WebDriverError: element not interactable\n  (Session info: chrome=90.0.4430.72)\n  (Driver info: chromedriver=90.0.4430.24 (4c6d850f087da467d926e8eddb76550aed655991-refs/branch-heads/4430@{#429}),platform=Windows NT 10.0.19042 x86_64)\n    at Object.checkLegacyResponse (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\error.js:546:15)\n    at parseHttpResponse (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\http.js:509:13)\n    at C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\http.js:441:30\n    at runMicrotasks (<anonymous>)\n    at processTicksAndRejections (internal/process/task_queues.js:93:5)\nFrom: Task: WebElement.sendKeys()\n    at Driver.schedule (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\webdriver.js:807:17)\n    at WebElement.schedule_ (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\webdriver.js:2010:25)\n    at WebElement.sendKeys (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\webdriver.js:2174:19)\n    at actionFn (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\built\\element.js:89:44)\n    at Array.map (<anonymous>)\n    at C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\built\\element.js:461:65\n    at ManagedPromise.invokeCallback_ (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:1376:14)\n    at TaskQueue.execute_ (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:3084:14)\n    at TaskQueue.executeNext_ (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:3067:27)\n    at C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:2927:27Error\n    at ElementArrayFinder.applyAction_ (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\built\\element.js:459:27)\n    at ElementArrayFinder.<computed> [as sendKeys] (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\built\\element.js:91:29)\n    at ElementFinder.<computed> [as sendKeys] (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\built\\element.js:831:22)\n    at UserContext.<anonymous> (C:\\Users\\Jasvinder Singh\\Documents\\Project\\Test Cases\\Small Projects_spec\\ConsumptionCalculator_Spec.js:82:43)\n    at C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasminewd2\\index.js:112:25\n    at new ManagedPromise (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:1077:7)\n    at ControlFlow.promise (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:2505:12)\n    at schedulerExecute (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasminewd2\\index.js:95:18)\n    at TaskQueue.execute_ (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:3084:14)\n    at TaskQueue.executeNext_ (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:3067:27)\nFrom: Task: Run it(\"Invalid Consumption Calculations\") in control flow\n    at UserContext.<anonymous> (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasminewd2\\index.js:94:19)\n    at attempt (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:4297:26)\n    at QueueRunner.run (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:4217:20)\n    at runNext (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:4257:20)\n    at C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:4264:13\n    at C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:4172:9\n    at C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasminewd2\\index.js:64:48\n    at ControlFlow.emit (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\events.js:62:21)\n    at ControlFlow.shutdown_ (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:2674:10)\n    at C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:2599:53\nFrom asynchronous test: \nError\n    at Suite.<anonymous> (C:\\Users\\Jasvinder Singh\\Documents\\Project\\Test Cases\\Small Projects_spec\\ConsumptionCalculator_Spec.js:79:5)\n    at addSpecsToSuite (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:1107:25)\n    at Env.describe (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:1074:7)\n    at describe (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:4399:18)\n    at Object.<anonymous> (C:\\Users\\Jasvinder Singh\\Documents\\Project\\Test Cases\\Small Projects_spec\\ConsumptionCalculator_Spec.js:6:1)\n    at Module._compile (internal/modules/cjs/loader.js:1063:30)\n    at Object.Module._extensions..js (internal/modules/cjs/loader.js:1092:10)\n    at Module.load (internal/modules/cjs/loader.js:928:32)\n    at Function.Module._load (internal/modules/cjs/loader.js:769:14)"
        ],
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1619154046398,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1619154046454,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00e50009-00a0-004c-00dd-005000ae00f1.png",
        "timestamp": 1619154046343,
        "duration": 1832
    },
    {
        "description": "Valid Simple Calculations|Assert UploadImage Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 6532,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1619154048713,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1619154048767,
                "type": ""
            }
        ],
        "screenShotFile": "images\\0079006f-006f-00db-00e6-000d009600e9.png",
        "timestamp": 1619154048634,
        "duration": 3809
    },
    {
        "description": "Invalid Simple Calculations|Assert UploadImage Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 6532,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 216:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1619154052792,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00da0068-0013-000a-007f-00d3004700cd.png",
        "timestamp": 1619154052579,
        "duration": 1425
    },
    {
        "description": "Assert home page navigation bar|Assert Course selection home Page",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 6532,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/visits - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619154062191,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00b900ec-00cc-008f-00bf-003e001d0090.png",
        "timestamp": 1619154054179,
        "duration": 27151
    },
    {
        "description": "functionality of home page navigation bar|Assert Course selection home Page",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 6532,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619154083482,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619154084563,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619154164331,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/sign_in - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619154164331,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://sso.teachable.com/ahoy/visits - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619154165595,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619154171031,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00aa0099-0070-00a1-009c-007f00fb0024.png",
        "timestamp": 1619154081587,
        "duration": 90421
    },
    {
        "description": "Print course details|Assert Course selection",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 6532,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619154172236,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/sign_up - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619154173269,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://sso.teachable.com/secure/673/users/sign_up?reset_purchase_session=1 - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619154173531,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "deprecation 3 'window.webkitStorageInfo' is deprecated. Please use 'navigator.webkitTemporaryStorage' or 'navigator.webkitPersistentStorage' instead.",
                "timestamp": 1619154183835,
                "type": ""
            }
        ],
        "screenShotFile": "images\\001700d0-00d2-00a1-0045-00ed00d30033.png",
        "timestamp": 1619154172315,
        "duration": 31587
    },
    {
        "description": "Print author name in dropdown|Assert Course selection",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 6532,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619154205905,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619154205905,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619154211842,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619154211842,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00e20088-00d9-00c7-00d4-0011003a00e8.png",
        "timestamp": 1619154204086,
        "duration": 12844
    },
    {
        "description": "Assert all courses by searching protractor|Assert Course selection",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 6532,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619154221406,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619154221530,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619154222173,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619154222176,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619154222261,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619154229735,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619154234877,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619154242285,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619154247366,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619154252422,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1619154257987,
                "type": ""
            }
        ],
        "screenShotFile": "images\\004100be-007a-00ee-000b-00d7002a00de.png",
        "timestamp": 1619154217175,
        "duration": 40803
    }
];

    this.sortSpecs = function () {
        this.results = results.sort(function sortFunction(a, b) {
    if (a.sessionId < b.sessionId) return -1;else if (a.sessionId > b.sessionId) return 1;

    if (a.timestamp < b.timestamp) return -1;else if (a.timestamp > b.timestamp) return 1;

    return 0;
});

    };

    this.setTitle = function () {
        var title = $('.report-title').text();
        titleService.setTitle(title);
    };

    // is run after all test data has been prepared/loaded
    this.afterLoadingJobs = function () {
        this.sortSpecs();
        this.setTitle();
    };

    this.loadResultsViaAjax = function () {

        $http({
            url: './combined.json',
            method: 'GET'
        }).then(function (response) {
                var data = null;
                if (response && response.data) {
                    if (typeof response.data === 'object') {
                        data = response.data;
                    } else if (response.data[0] === '"') { //detect super escaped file (from circular json)
                        data = CircularJSON.parse(response.data); //the file is escaped in a weird way (with circular json)
                    } else {
                        data = JSON.parse(response.data);
                    }
                }
                if (data) {
                    results = data;
                    that.afterLoadingJobs();
                }
            },
            function (error) {
                console.error(error);
            });
    };


    if (clientDefaults.useAjax) {
        this.loadResultsViaAjax();
    } else {
        this.afterLoadingJobs();
    }

}]);

app.filter('bySearchSettings', function () {
    return function (items, searchSettings) {
        var filtered = [];
        if (!items) {
            return filtered; // to avoid crashing in where results might be empty
        }
        var prevItem = null;

        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            item.displaySpecName = false;

            var isHit = false; //is set to true if any of the search criteria matched
            countLogMessages(item); // modifies item contents

            var hasLog = searchSettings.withLog && item.browserLogs && item.browserLogs.length > 0;
            if (searchSettings.description === '' ||
                (item.description && item.description.toLowerCase().indexOf(searchSettings.description.toLowerCase()) > -1)) {

                if (searchSettings.passed && item.passed || hasLog) {
                    isHit = true;
                } else if (searchSettings.failed && !item.passed && !item.pending || hasLog) {
                    isHit = true;
                } else if (searchSettings.pending && item.pending || hasLog) {
                    isHit = true;
                }
            }
            if (isHit) {
                checkIfShouldDisplaySpecName(prevItem, item);

                filtered.push(item);
                prevItem = item;
            }
        }

        return filtered;
    };
});

//formats millseconds to h m s
app.filter('timeFormat', function () {
    return function (tr, fmt) {
        if(tr == null){
            return "NaN";
        }

        switch (fmt) {
            case 'h':
                var h = tr / 1000 / 60 / 60;
                return "".concat(h.toFixed(2)).concat("h");
            case 'm':
                var m = tr / 1000 / 60;
                return "".concat(m.toFixed(2)).concat("min");
            case 's' :
                var s = tr / 1000;
                return "".concat(s.toFixed(2)).concat("s");
            case 'hm':
            case 'h:m':
                var hmMt = tr / 1000 / 60;
                var hmHr = Math.trunc(hmMt / 60);
                var hmMr = hmMt - (hmHr * 60);
                if (fmt === 'h:m') {
                    return "".concat(hmHr).concat(":").concat(hmMr < 10 ? "0" : "").concat(Math.round(hmMr));
                }
                return "".concat(hmHr).concat("h ").concat(hmMr.toFixed(2)).concat("min");
            case 'hms':
            case 'h:m:s':
                var hmsS = tr / 1000;
                var hmsHr = Math.trunc(hmsS / 60 / 60);
                var hmsM = hmsS / 60;
                var hmsMr = Math.trunc(hmsM - hmsHr * 60);
                var hmsSo = hmsS - (hmsHr * 60 * 60) - (hmsMr*60);
                if (fmt === 'h:m:s') {
                    return "".concat(hmsHr).concat(":").concat(hmsMr < 10 ? "0" : "").concat(hmsMr).concat(":").concat(hmsSo < 10 ? "0" : "").concat(Math.round(hmsSo));
                }
                return "".concat(hmsHr).concat("h ").concat(hmsMr).concat("min ").concat(hmsSo.toFixed(2)).concat("s");
            case 'ms':
                var msS = tr / 1000;
                var msMr = Math.trunc(msS / 60);
                var msMs = msS - (msMr * 60);
                return "".concat(msMr).concat("min ").concat(msMs.toFixed(2)).concat("s");
        }

        return tr;
    };
});


function PbrStackModalController($scope, $rootScope) {
    var ctrl = this;
    ctrl.rootScope = $rootScope;
    ctrl.getParent = getParent;
    ctrl.getShortDescription = getShortDescription;
    ctrl.convertTimestamp = convertTimestamp;
    ctrl.isValueAnArray = isValueAnArray;
    ctrl.toggleSmartStackTraceHighlight = function () {
        var inv = !ctrl.rootScope.showSmartStackTraceHighlight;
        ctrl.rootScope.showSmartStackTraceHighlight = inv;
    };
    ctrl.applySmartHighlight = function (line) {
        if ($rootScope.showSmartStackTraceHighlight) {
            if (line.indexOf('node_modules') > -1) {
                return 'greyout';
            }
            if (line.indexOf('  at ') === -1) {
                return '';
            }

            return 'highlight';
        }
        return '';
    };
}


app.component('pbrStackModal', {
    templateUrl: "pbr-stack-modal.html",
    bindings: {
        index: '=',
        data: '='
    },
    controller: PbrStackModalController
});

function PbrScreenshotModalController($scope, $rootScope) {
    var ctrl = this;
    ctrl.rootScope = $rootScope;
    ctrl.getParent = getParent;
    ctrl.getShortDescription = getShortDescription;

    /**
     * Updates which modal is selected.
     */
    this.updateSelectedModal = function (event, index) {
        var key = event.key; //try to use non-deprecated key first https://developer.mozilla.org/de/docs/Web/API/KeyboardEvent/keyCode
        if (key == null) {
            var keyMap = {
                37: 'ArrowLeft',
                39: 'ArrowRight'
            };
            key = keyMap[event.keyCode]; //fallback to keycode
        }
        if (key === "ArrowLeft" && this.hasPrevious) {
            this.showHideModal(index, this.previous);
        } else if (key === "ArrowRight" && this.hasNext) {
            this.showHideModal(index, this.next);
        }
    };

    /**
     * Hides the modal with the #oldIndex and shows the modal with the #newIndex.
     */
    this.showHideModal = function (oldIndex, newIndex) {
        const modalName = '#imageModal';
        $(modalName + oldIndex).modal("hide");
        $(modalName + newIndex).modal("show");
    };

}

app.component('pbrScreenshotModal', {
    templateUrl: "pbr-screenshot-modal.html",
    bindings: {
        index: '=',
        data: '=',
        next: '=',
        previous: '=',
        hasNext: '=',
        hasPrevious: '='
    },
    controller: PbrScreenshotModalController
});

app.factory('TitleService', ['$document', function ($document) {
    return {
        setTitle: function (title) {
            $document[0].title = title;
        }
    };
}]);


app.run(
    function ($rootScope, $templateCache) {
        //make sure this option is on by default
        $rootScope.showSmartStackTraceHighlight = true;
        
  $templateCache.put('pbr-screenshot-modal.html',
    '<div class="modal" id="imageModal{{$ctrl.index}}" tabindex="-1" role="dialog"\n' +
    '     aria-labelledby="imageModalLabel{{$ctrl.index}}" ng-keydown="$ctrl.updateSelectedModal($event,$ctrl.index)">\n' +
    '    <div class="modal-dialog modal-lg m-screenhot-modal" role="document">\n' +
    '        <div class="modal-content">\n' +
    '            <div class="modal-header">\n' +
    '                <button type="button" class="close" data-dismiss="modal" aria-label="Close">\n' +
    '                    <span aria-hidden="true">&times;</span>\n' +
    '                </button>\n' +
    '                <h6 class="modal-title" id="imageModalLabelP{{$ctrl.index}}">\n' +
    '                    {{$ctrl.getParent($ctrl.data.description)}}</h6>\n' +
    '                <h5 class="modal-title" id="imageModalLabel{{$ctrl.index}}">\n' +
    '                    {{$ctrl.getShortDescription($ctrl.data.description)}}</h5>\n' +
    '            </div>\n' +
    '            <div class="modal-body">\n' +
    '                <img class="screenshotImage" ng-src="{{$ctrl.data.screenShotFile}}">\n' +
    '            </div>\n' +
    '            <div class="modal-footer">\n' +
    '                <div class="pull-left">\n' +
    '                    <button ng-disabled="!$ctrl.hasPrevious" class="btn btn-default btn-previous" data-dismiss="modal"\n' +
    '                            data-toggle="modal" data-target="#imageModal{{$ctrl.previous}}">\n' +
    '                        Prev\n' +
    '                    </button>\n' +
    '                    <button ng-disabled="!$ctrl.hasNext" class="btn btn-default btn-next"\n' +
    '                            data-dismiss="modal" data-toggle="modal"\n' +
    '                            data-target="#imageModal{{$ctrl.next}}">\n' +
    '                        Next\n' +
    '                    </button>\n' +
    '                </div>\n' +
    '                <a class="btn btn-primary" href="{{$ctrl.data.screenShotFile}}" target="_blank">\n' +
    '                    Open Image in New Tab\n' +
    '                    <span class="glyphicon glyphicon-new-window" aria-hidden="true"></span>\n' +
    '                </a>\n' +
    '                <button type="button" class="btn btn-default" data-dismiss="modal">Close</button>\n' +
    '            </div>\n' +
    '        </div>\n' +
    '    </div>\n' +
    '</div>\n' +
     ''
  );

  $templateCache.put('pbr-stack-modal.html',
    '<div class="modal" id="modal{{$ctrl.index}}" tabindex="-1" role="dialog"\n' +
    '     aria-labelledby="stackModalLabel{{$ctrl.index}}">\n' +
    '    <div class="modal-dialog modal-lg m-stack-modal" role="document">\n' +
    '        <div class="modal-content">\n' +
    '            <div class="modal-header">\n' +
    '                <button type="button" class="close" data-dismiss="modal" aria-label="Close">\n' +
    '                    <span aria-hidden="true">&times;</span>\n' +
    '                </button>\n' +
    '                <h6 class="modal-title" id="stackModalLabelP{{$ctrl.index}}">\n' +
    '                    {{$ctrl.getParent($ctrl.data.description)}}</h6>\n' +
    '                <h5 class="modal-title" id="stackModalLabel{{$ctrl.index}}">\n' +
    '                    {{$ctrl.getShortDescription($ctrl.data.description)}}</h5>\n' +
    '            </div>\n' +
    '            <div class="modal-body">\n' +
    '                <div ng-if="$ctrl.data.trace.length > 0">\n' +
    '                    <div ng-if="$ctrl.isValueAnArray($ctrl.data.trace)">\n' +
    '                        <pre class="logContainer" ng-repeat="trace in $ctrl.data.trace track by $index"><div ng-class="$ctrl.applySmartHighlight(line)" ng-repeat="line in trace.split(\'\\n\') track by $index">{{line}}</div></pre>\n' +
    '                    </div>\n' +
    '                    <div ng-if="!$ctrl.isValueAnArray($ctrl.data.trace)">\n' +
    '                        <pre class="logContainer"><div ng-class="$ctrl.applySmartHighlight(line)" ng-repeat="line in $ctrl.data.trace.split(\'\\n\') track by $index">{{line}}</div></pre>\n' +
    '                    </div>\n' +
    '                </div>\n' +
    '                <div ng-if="$ctrl.data.browserLogs.length > 0">\n' +
    '                    <h5 class="modal-title">\n' +
    '                        Browser logs:\n' +
    '                    </h5>\n' +
    '                    <pre class="logContainer"><div class="browserLogItem"\n' +
    '                                                   ng-repeat="logError in $ctrl.data.browserLogs track by $index"><div><span class="label browserLogLabel label-default"\n' +
    '                                                                                                                             ng-class="{\'label-danger\': logError.level===\'SEVERE\', \'label-warning\': logError.level===\'WARNING\'}">{{logError.level}}</span><span class="label label-default">{{$ctrl.convertTimestamp(logError.timestamp)}}</span><div ng-repeat="messageLine in logError.message.split(\'\\\\n\') track by $index">{{ messageLine }}</div></div></div></pre>\n' +
    '                </div>\n' +
    '            </div>\n' +
    '            <div class="modal-footer">\n' +
    '                <button class="btn btn-default"\n' +
    '                        ng-class="{active: $ctrl.rootScope.showSmartStackTraceHighlight}"\n' +
    '                        ng-click="$ctrl.toggleSmartStackTraceHighlight()">\n' +
    '                    <span class="glyphicon glyphicon-education black"></span> Smart Stack Trace\n' +
    '                </button>\n' +
    '                <button type="button" class="btn btn-default" data-dismiss="modal">Close</button>\n' +
    '            </div>\n' +
    '        </div>\n' +
    '    </div>\n' +
    '</div>\n' +
     ''
  );

    });
