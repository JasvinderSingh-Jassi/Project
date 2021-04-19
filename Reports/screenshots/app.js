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
        "instanceId": 17236,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618389705786,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618389708118,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00530060-000a-0070-00e0-00e3005b00f4.png",
        "timestamp": 1618389703504,
        "duration": 23280
    },
    {
        "description": "Assert various search boxes and search result|Assert SearchFilter Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 17236,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618389729294,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618389729563,
                "type": ""
            }
        ],
        "screenShotFile": "images\\0002003f-0043-00cb-00f4-00dc000300b0.png",
        "timestamp": 1618389727766,
        "duration": 7208
    },
    {
        "description": "Assert various searches and data in WebTable|Assert WebTable Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 17236,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618389735663,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618389735830,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00af00c6-00b9-0038-00f4-00d2000c00dd.png",
        "timestamp": 1618389735476,
        "duration": 4793
    },
    {
        "description": "Signin with invalid username and password and assert the error labels|Assert RegistrationLogin Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 17236,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618389740772,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618389740975,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00ed0024-009a-00cf-0008-00f700e50004.png",
        "timestamp": 1618389740702,
        "duration": 11793
    },
    {
        "description": "Assert login is successful, and assert the labels shown |Assert RegistrationLogin Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 17236,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618389753032,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00e100aa-00ed-00e1-0008-007c0062008c.png",
        "timestamp": 1618389752850,
        "duration": 12778
    },
    {
        "description": "Assert various search boxes and search result|Assert Scrollable Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 17236,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618389766278,
                "type": ""
            }
        ],
        "screenShotFile": "images\\003f0025-00b1-00ca-0023-00bf007600b2.png",
        "timestamp": 1618389766011,
        "duration": 3318
    },
    {
        "description": "Assert and upload image|Assert UploadImage Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 17236,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618389770191,
                "type": ""
            }
        ],
        "screenShotFile": "images\\001d00ba-0010-00bf-0013-00a900df004d.png",
        "timestamp": 1618389769793,
        "duration": 5105
    },
    {
        "description": "Functionality of Customer Transaction|Functionality of XYZ Bank Customer login",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 17236,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618389776574,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618389776733,
                "type": ""
            }
        ],
        "screenShotFile": "images\\0017001d-005c-00ad-000e-00a300fa0002.png",
        "timestamp": 1618389775365,
        "duration": 12269
    },
    {
        "description": "Functionality of Customer Deposit|Functionality of XYZ Bank Customer login",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 17236,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618389788733,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618389788942,
                "type": ""
            }
        ],
        "screenShotFile": "images\\001100cf-00e2-001f-0048-0069000e0003.png",
        "timestamp": 1618389788001,
        "duration": 4944
    },
    {
        "description": "Functionality of Customer Deposit|Functionality of XYZ Bank Customer login",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 17236,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618389793404,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618389793517,
                "type": ""
            }
        ],
        "screenShotFile": "images\\005800c6-0070-0025-0010-00a2009300b4.png",
        "timestamp": 1618389793333,
        "duration": 3994
    },
    {
        "description": "click Home Page|XYZ Bank Home Page",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 17236,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618389798120,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618389798395,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00140051-0068-00f8-00fb-002f00070047.png",
        "timestamp": 1618389797793,
        "duration": 2150
    },
    {
        "description": "AddCustomer section|click XYZ Bank Manager login",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 17236,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618389800453,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618389800630,
                "type": ""
            }
        ],
        "screenShotFile": "images\\004e0070-0098-0010-0032-00d100db00bc.png",
        "timestamp": 1618389800293,
        "duration": 4389
    },
    {
        "description": "OpenAccount section|click XYZ Bank Manager login",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 17236,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618389805675,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00a5008d-000f-00e1-005c-00bd000700ae.png",
        "timestamp": 1618389805117,
        "duration": 3472
    },
    {
        "description": "Customers section|click XYZ Bank Manager login",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 17236,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618389809487,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00f4004b-00c9-00b4-00e6-00a900c50063.png",
        "timestamp": 1618389809044,
        "duration": 2796
    },
    {
        "description": "Valid Consumption Calculations|Assert UploadImage Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 17236,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618389812488,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00640050-0084-0091-0000-005500f60084.png",
        "timestamp": 1618389812258,
        "duration": 4636
    },
    {
        "description": "Invalid Consumption Calculations|Assert UploadImage Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 17236,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618389817496,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618389817713,
                "type": ""
            }
        ],
        "screenShotFile": "images\\0022000a-00c9-00c3-0011-00dc000100d5.png",
        "timestamp": 1618389817333,
        "duration": 3361
    },
    {
        "description": "Valid Simple Calculations|Assert UploadImage Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 17236,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618389821365,
                "type": ""
            }
        ],
        "screenShotFile": "images\\003500c0-008b-000d-007d-00d200c900ff.png",
        "timestamp": 1618389821091,
        "duration": 5093
    },
    {
        "description": "Invalid Simple Calculations|Assert UploadImage Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 17236,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618389826703,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618389826804,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00cd00f0-002d-0006-0091-00af007600ae.png",
        "timestamp": 1618389826568,
        "duration": 2769
    },
    {
        "description": "Assert home page navigation bar|Assert Course selection home Page",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 17236,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/visits - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618389837512,
                "type": ""
            }
        ],
        "screenShotFile": "images\\0020002d-0000-0061-00f7-00d800c00084.png",
        "timestamp": 1618389829721,
        "duration": 27655
    },
    {
        "description": "functionality of home page navigation bar|Assert Course selection home Page",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 17236,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618389862579,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618389863611,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618389877821,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618389877823,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618389878738,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/sign_in - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618389883921,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://sso.teachable.com/ahoy/visits - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618389883922,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618389888359,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618389888360,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618389888361,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00270051-0027-0063-00f7-00d8004700a1.png",
        "timestamp": 1618389857974,
        "duration": 31419
    },
    {
        "description": "Print course details|Assert Course selection",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 17236,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618389889516,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/sign_up - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618389890657,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://sso.teachable.com/secure/673/users/sign_up?reset_purchase_session=1 - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618389890841,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "deprecation 3 'window.webkitStorageInfo' is deprecated. Please use 'navigator.webkitTemporaryStorage' or 'navigator.webkitPersistentStorage' instead.",
                "timestamp": 1618389901337,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00a00062-00a0-009a-0029-001d003d00a2.png",
        "timestamp": 1618389890005,
        "duration": 31425
    },
    {
        "description": "Print author name in dropdown|Assert Course selection",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 17236,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618389923626,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618389923626,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618389923626,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618389923632,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618389929625,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618389929626,
                "type": ""
            }
        ],
        "screenShotFile": "images\\003a00a6-006a-007f-0088-006d002d00c0.png",
        "timestamp": 1618389921769,
        "duration": 12963
    },
    {
        "description": "Assert all courses by searching protractor|Assert Course selection",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 17236,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618389940853,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618389940857,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618389940869,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618389940873,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618389940953,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618389940972,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618389943947,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618389950670,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618389955791,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618389963270,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618389968392,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618389973534,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618389978825,
                "type": ""
            }
        ],
        "screenShotFile": "images\\007900e1-0040-0078-0095-004500dc0004.png",
        "timestamp": 1618389935184,
        "duration": 43635
    },
    {
        "description": "Assert home page Journey Details|Assert and functionality check of Journey Details",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 17236,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "WARNING",
                "message": "https://www.delta.com/resources/f8309c9ed363120c0d0265eb98f27f913a30d77a1d98e 18 Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check https://xhr.spec.whatwg.org/.",
                "timestamp": 1618389983775,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.delta.com/apac/en - Mixed Content: The page at 'https://www.delta.com/apac/en' was loaded over HTTPS, but requested an insecure XMLHttpRequest endpoint 'http://dpm.demdex.net/id/rd?d_visid_ver=2.3.0&d_fieldgroup=MC&d_rtbd=json&d_ver=2&d_verify=1&d_orgid=F0E65E09512D2CC50A490D4D%40AdobeOrg&d_nsid=0&ts=1618389983722'. This request has been blocked; the content must be served over HTTPS.",
                "timestamp": 1618389984702,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://gum.criteo.com/sync?c=327&a=1&r=1&u=https://pulse.delta.com/pc/delta/%3Fcw_criteoid%3D%40USERID%40 - Failed to load resource: net::ERR_CONNECTION_TIMED_OUT",
                "timestamp": 1618390015310,
                "type": ""
            }
        ],
        "screenShotFile": "images\\005400a1-00ba-00fe-00d8-0076007e002b.png",
        "timestamp": 1618389979236,
        "duration": 36261
    },
    {
        "description": "Assert home page navigation bar|Assert and functionality check of delta navigation bar",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 17236,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "WARNING",
                "message": "https://www.delta.com/resources/f8309c9ed363120c0d0265eb98f27f913a30d77a1d98e 18 Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check https://xhr.spec.whatwg.org/.",
                "timestamp": 1618390017037,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://gum.criteo.com/sync?c=327&a=1&r=1&u=https://pulse.delta.com/pc/delta/%3Fcw_criteoid%3D%40USERID%40 - Failed to load resource: net::ERR_CONNECTION_REFUSED",
                "timestamp": 1618390042084,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00d60035-00a1-001e-00ba-0018009e00b3.png",
        "timestamp": 1618390015857,
        "duration": 26645
    },
    {
        "description": "Functionality of home page navigation bar|Assert and functionality check of delta navigation bar",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 17236,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "WARNING",
                "message": "https://www.delta.com/resources/f8309c9ed363120c0d0265eb98f27f913a30d77a1d98e 18 Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check https://xhr.spec.whatwg.org/.",
                "timestamp": 1618390043925,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://gum.criteo.com/sync?c=327&a=1&r=1&u=https://pulse.delta.com/pc/delta/%3Fcw_criteoid%3D%40USERID%40 - Failed to load resource: net::ERR_CONNECTION_REFUSED",
                "timestamp": 1618390069030,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://www.delta.com/resources/f8309c9ed363120c0d0265eb98f27f913a30d77a1d98e 18 Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check https://xhr.spec.whatwg.org/.",
                "timestamp": 1618390070551,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://gum.criteo.com/sync?c=327&a=1&r=1&u=https://pulse.delta.com/pc/delta/%3Fcw_criteoid%3D%40USERID%40 - Failed to load resource: net::ERR_CONNECTION_REFUSED",
                "timestamp": 1618390095647,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://www.delta.com/resources/f8309c9ed363120c0d0265eb98f27f913a30d77a1d98e 18 Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check https://xhr.spec.whatwg.org/.",
                "timestamp": 1618390101125,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://delta-www.baynote.net/baynote/tags3/common?customerId=delta&code=www&timeout=undefined&onFailure=undefined - Failed to load resource: net::ERR_NAME_NOT_RESOLVED",
                "timestamp": 1618390102899,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://gum.criteo.com/sync?c=327&a=1&r=1&u=https://pulse.delta.com/pc/delta/%3Fcw_criteoid%3D%40USERID%40 - Failed to load resource: net::ERR_CONNECTION_REFUSED",
                "timestamp": 1618390126058,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://www.delta.com/resources/f8309c9ed363120c0d0265eb98f27f913a30d77a1d98e 18 Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check https://xhr.spec.whatwg.org/.",
                "timestamp": 1618390128487,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://www.delta.com/resources/f8309c9ed363120c0d0265eb98f27f913a30d77a1d98e 18 Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check https://xhr.spec.whatwg.org/.",
                "timestamp": 1618390135316,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://gum.criteo.com/sync?c=327&a=1&r=1&u=https://pulse.delta.com/pc/delta/%3Fcw_criteoid%3D%40USERID%40 - Failed to load resource: net::ERR_CONNECTION_REFUSED",
                "timestamp": 1618390160852,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://www.delta.com/resources/f8309c9ed363120c0d0265eb98f27f913a30d77a1d98e 18 Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check https://xhr.spec.whatwg.org/.",
                "timestamp": 1618390162373,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://gum.criteo.com/sync?c=327&a=1&r=1&u=https://pulse.delta.com/pc/delta/%3Fcw_criteoid%3D%40USERID%40 - Failed to load resource: net::ERR_CONNECTION_REFUSED",
                "timestamp": 1618390187437,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://www.delta.com/resources/f8309c9ed363120c0d0265eb98f27f913a30d77a1d98e 18 Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check https://xhr.spec.whatwg.org/.",
                "timestamp": 1618390190623,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://delta-www.baynote.net/baynote/tags3/common?customerId=delta&code=www&timeout=undefined&onFailure=undefined - Failed to load resource: net::ERR_NAME_NOT_RESOLVED",
                "timestamp": 1618390192087,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://ssp.delta.com/content/dam/delta-www/sorry-server/delta_sorry.html?&q=Coronavirus%27&ct=load&s=&site=delta - Failed to load resource: net::ERR_CERT_COMMON_NAME_INVALID",
                "timestamp": 1618390193473,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://content.delta.com/content/dam/delta-applications/js/sitewide/v21.3.0/criticalPath.min.js 0:5643 \"Ajax Error occurred\"",
                "timestamp": 1618390197362,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://gum.criteo.com/sync?c=327&a=1&r=1&u=https://pulse.delta.com/pc/delta/%3Fcw_criteoid%3D%40USERID%40 - Failed to load resource: net::ERR_CONNECTION_REFUSED",
                "timestamp": 1618390215790,
                "type": ""
            }
        ],
        "screenShotFile": "images\\006e00dc-002d-0073-00ad-00be00a2006e.png",
        "timestamp": 1618390042886,
        "duration": 173008
    },
    {
        "description": "Assert Multiform|Assert Basic Components",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 17236,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618390217807,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618390218052,
                "type": ""
            }
        ],
        "timestamp": 1618390216255,
        "duration": 13692
    },
    {
        "description": "Assert various Multiform|Assert Multiform Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 8784,
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
                "timestamp": 1618807216449,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618807218800,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00490008-00db-009e-000a-0089000f00b0.png",
        "timestamp": 1618807213329,
        "duration": 19018
    },
    {
        "description": "Assert various search boxes and search result|Assert SearchFilter Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 8784,
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
                "timestamp": 1618807233153,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618807233399,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00e900fc-0037-0018-003e-008f00b8008e.png",
        "timestamp": 1618807233060,
        "duration": 7540
    },
    {
        "description": "Assert various searches and data in WebTable|Assert WebTable Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 8784,
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
                "timestamp": 1618807240767,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618807240807,
                "type": ""
            }
        ],
        "screenShotFile": "images\\001f0014-001b-001e-00a3-009f00170016.png",
        "timestamp": 1618807240715,
        "duration": 5574
    },
    {
        "description": "Signin with invalid username and password and assert the error labels|Assert RegistrationLogin Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 8784,
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
                "timestamp": 1618807248698,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00b000a0-00c9-0037-0030-00c700f80034.png",
        "timestamp": 1618807248507,
        "duration": 9089
    },
    {
        "description": "Assert login is successful, and assert the labels shown |Assert RegistrationLogin Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 8784,
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
                "timestamp": 1618807257862,
                "type": ""
            }
        ],
        "screenShotFile": "images\\0014006a-0053-008c-008c-006a00460059.png",
        "timestamp": 1618807257671,
        "duration": 10578
    },
    {
        "description": "Assert various search boxes and search result|Assert Scrollable Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 8784,
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
                "timestamp": 1618807268549,
                "type": ""
            }
        ],
        "screenShotFile": "images\\000900e3-0057-0008-0091-00b00027007f.png",
        "timestamp": 1618807268348,
        "duration": 3294
    },
    {
        "description": "Assert and upload image|Assert UploadImage Section",
        "passed": false,
        "pending": false,
        "os": "Windows",
        "instanceId": 8784,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": [
            "Failed: invalid argument: File not found : C://Users//mindfire//Downloads//pp.jpg\n  (Session info: chrome=90.0.4430.72)\n  (Driver info: chromedriver=90.0.4430.24 (4c6d850f087da467d926e8eddb76550aed655991-refs/branch-heads/4430@{#429}),platform=Windows NT 10.0.19042 x86_64)"
        ],
        "trace": [
            "WebDriverError: invalid argument: File not found : C://Users//mindfire//Downloads//pp.jpg\n  (Session info: chrome=90.0.4430.72)\n  (Driver info: chromedriver=90.0.4430.24 (4c6d850f087da467d926e8eddb76550aed655991-refs/branch-heads/4430@{#429}),platform=Windows NT 10.0.19042 x86_64)\n    at Object.checkLegacyResponse (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\error.js:546:15)\n    at parseHttpResponse (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\http.js:509:13)\n    at C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\http.js:441:30\n    at runMicrotasks (<anonymous>)\n    at processTicksAndRejections (internal/process/task_queues.js:93:5)\nFrom: Task: WebElement.sendKeys()\n    at Driver.schedule (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\webdriver.js:807:17)\n    at WebElement.schedule_ (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\webdriver.js:2010:25)\n    at WebElement.sendKeys (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\webdriver.js:2174:19)\n    at actionFn (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\built\\element.js:89:44)\n    at Array.map (<anonymous>)\n    at C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\built\\element.js:461:65\n    at ManagedPromise.invokeCallback_ (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:1376:14)\n    at TaskQueue.execute_ (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:3084:14)\n    at TaskQueue.executeNext_ (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:3067:27)\n    at C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:2927:27Error\n    at ElementArrayFinder.applyAction_ (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\built\\element.js:459:27)\n    at ElementArrayFinder.<computed> [as sendKeys] (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\built\\element.js:91:29)\n    at ElementFinder.<computed> [as sendKeys] (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\built\\element.js:831:22)\n    at UserContext.<anonymous> (C:\\Users\\Jasvinder Singh\\Documents\\Project\\Test Cases\\Intermediate_Components_spec\\UploadImage_Spec.js:56:38)\n    at C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasminewd2\\index.js:112:25\n    at new ManagedPromise (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:1077:7)\n    at ControlFlow.promise (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:2505:12)\n    at schedulerExecute (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasminewd2\\index.js:95:18)\n    at TaskQueue.execute_ (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:3084:14)\n    at TaskQueue.executeNext_ (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:3067:27)\nFrom: Task: Run it(\"Assert and upload image\") in control flow\n    at UserContext.<anonymous> (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasminewd2\\index.js:94:19)\n    at attempt (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:4297:26)\n    at QueueRunner.run (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:4217:20)\n    at runNext (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:4257:20)\n    at C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:4264:13\n    at C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:4172:9\n    at C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasminewd2\\index.js:64:48\n    at ControlFlow.emit (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\events.js:62:21)\n    at ControlFlow.shutdown_ (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:2674:10)\n    at C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:2599:53\nFrom asynchronous test: \nError\n    at Suite.<anonymous> (C:\\Users\\Jasvinder Singh\\Documents\\Project\\Test Cases\\Intermediate_Components_spec\\UploadImage_Spec.js:30:5)\n    at addSpecsToSuite (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:1107:25)\n    at Env.describe (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:1074:7)\n    at describe (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:4399:18)\n    at Object.<anonymous> (C:\\Users\\Jasvinder Singh\\Documents\\Project\\Test Cases\\Intermediate_Components_spec\\UploadImage_Spec.js:6:1)\n    at Module._compile (internal/modules/cjs/loader.js:1063:30)\n    at Object.Module._extensions..js (internal/modules/cjs/loader.js:1092:10)\n    at Module.load (internal/modules/cjs/loader.js:928:32)\n    at Function.Module._load (internal/modules/cjs/loader.js:769:14)"
        ],
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618807271927,
                "type": ""
            }
        ],
        "screenShotFile": "images\\006500b6-00f8-0057-0095-00fd003800d9.png",
        "timestamp": 1618807271750,
        "duration": 3974
    },
    {
        "description": "Functionality of Customer Transaction|Functionality of XYZ Bank Customer login",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 8784,
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
                "timestamp": 1618807275972,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00bc0053-0087-00cb-0050-006a00e200f9.png",
        "timestamp": 1618807275803,
        "duration": 6461
    },
    {
        "description": "Functionality of Customer Deposit|Functionality of XYZ Bank Customer login",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 8784,
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
                "timestamp": 1618807282469,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618807282660,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00f7005a-003c-00ed-0045-00ae00ed00b7.png",
        "timestamp": 1618807282358,
        "duration": 2527
    },
    {
        "description": "Functionality of Customer Deposit|Functionality of XYZ Bank Customer login",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 8784,
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
                "timestamp": 1618807285083,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618807285268,
                "type": ""
            }
        ],
        "screenShotFile": "images\\001800ba-0038-00ac-0014-000b00090043.png",
        "timestamp": 1618807284995,
        "duration": 2014
    },
    {
        "description": "click Home Page|XYZ Bank Home Page",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 8784,
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
                "timestamp": 1618807287189,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618807287397,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00dd005f-00a1-0011-0068-00a30040006f.png",
        "timestamp": 1618807287114,
        "duration": 999
    },
    {
        "description": "AddCustomer section|click XYZ Bank Manager login",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 8784,
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
                "timestamp": 1618807288286,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618807288508,
                "type": ""
            }
        ],
        "screenShotFile": "images\\006000e5-0000-0060-00ec-008700550049.png",
        "timestamp": 1618807288209,
        "duration": 2859
    },
    {
        "description": "OpenAccount section|click XYZ Bank Manager login",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 8784,
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
                "timestamp": 1618807291256,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618807291480,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00d2007f-00d6-00a0-009a-00bc00ec00a2.png",
        "timestamp": 1618807291173,
        "duration": 2322
    },
    {
        "description": "Customers section|click XYZ Bank Manager login",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 8784,
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
                "timestamp": 1618807293804,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00d400d7-0010-0088-0069-009b00940028.png",
        "timestamp": 1618807293598,
        "duration": 1550
    },
    {
        "description": "Valid Consumption Calculations|Assert UploadImage Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 8784,
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
                "timestamp": 1618807295368,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618807295554,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00290046-0062-0031-007d-00ee00d70000.png",
        "timestamp": 1618807295259,
        "duration": 4226
    },
    {
        "description": "Invalid Consumption Calculations|Assert UploadImage Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 8784,
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
                "timestamp": 1618807300230,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618807300276,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00950041-0080-006f-006b-00660005001b.png",
        "timestamp": 1618807300181,
        "duration": 1442
    },
    {
        "description": "Valid Simple Calculations|Assert UploadImage Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 8784,
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
                "timestamp": 1618807301795,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618807301836,
                "type": ""
            }
        ],
        "screenShotFile": "images\\008d0043-0062-00aa-003d-00d40082001b.png",
        "timestamp": 1618807301737,
        "duration": 3117
    },
    {
        "description": "Invalid Simple Calculations|Assert UploadImage Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 8784,
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
                "timestamp": 1618807305137,
                "type": ""
            }
        ],
        "screenShotFile": "images\\003f0043-0028-0060-0028-001700a600e6.png",
        "timestamp": 1618807304945,
        "duration": 1503
    },
    {
        "description": "Assert home page navigation bar|Assert Course selection home Page",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 8784,
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
                "timestamp": 1618807310691,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00c40073-00a5-001b-0050-00c1006d0095.png",
        "timestamp": 1618807306561,
        "duration": 10653
    },
    {
        "description": "functionality of home page navigation bar|Assert Course selection home Page",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 8784,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618807319010,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618807320134,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618807328597,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618807328597,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618807334136,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/sign_in - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618807334136,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://sso.teachable.com/ahoy/visits - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618807334137,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618807335165,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618807335165,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618807335166,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00f60063-00e8-0079-00dc-00a200d50053.png",
        "timestamp": 1618807317468,
        "duration": 18299
    },
    {
        "description": "Print course details|Assert Course selection",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 8784,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618807336276,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618807336736,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618807336736,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618807336807,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618807336808,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618807347173,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00750000-00f6-0080-0092-003b00870001.png",
        "timestamp": 1618807336053,
        "duration": 31488
    },
    {
        "description": "Print author name in dropdown|Assert Course selection",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 8784,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618807377063,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618807377064,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618807377087,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618807377101,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618807377101,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618807382789,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618807382789,
                "type": ""
            }
        ],
        "screenShotFile": "images\\0055009f-00f7-00cb-0044-00e5008600a2.png",
        "timestamp": 1618807367765,
        "duration": 20113
    },
    {
        "description": "Assert all courses by searching protractor|Assert Course selection",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 8784,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618807389648,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618807389650,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618807389692,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618807389693,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618807389693,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618807389708,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618807389708,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618807390750,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618807397165,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618807402263,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618807409312,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618807414373,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618807419462,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618807424722,
                "type": ""
            }
        ],
        "screenShotFile": "images\\001f0030-0000-004a-001d-007c00730054.png",
        "timestamp": 1618807388112,
        "duration": 36609
    },
    {
        "description": "Assert home page Journey Details|Assert and functionality check of Journey Details",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 8784,
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
                "timestamp": 1618807428653,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.delta.com/apac/en - Mixed Content: The page at 'https://www.delta.com/apac/en' was loaded over HTTPS, but requested an insecure XMLHttpRequest endpoint 'http://dpm.demdex.net/id/rd?d_visid_ver=2.3.0&d_fieldgroup=MC&d_rtbd=json&d_ver=2&d_verify=1&d_orgid=F0E65E09512D2CC50A490D4D%40AdobeOrg&d_nsid=0&ts=1618807428607'. This request has been blocked; the content must be served over HTTPS.",
                "timestamp": 1618807429561,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://gum.criteo.com/sync?c=327&a=1&r=1&u=https://pulse.delta.com/pc/delta/%3Fcw_criteoid%3D%40USERID%40 - Failed to load resource: net::ERR_CONNECTION_REFUSED",
                "timestamp": 1618807455946,
                "type": ""
            }
        ],
        "screenShotFile": "images\\008a0028-009b-0040-000f-000400630015.png",
        "timestamp": 1618807424923,
        "duration": 31225
    },
    {
        "description": "Assert home page navigation bar|Assert and functionality check of delta navigation bar",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 8784,
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
                "timestamp": 1618807457206,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://gum.criteo.com/sync?c=327&a=1&r=1&u=https://pulse.delta.com/pc/delta/%3Fcw_criteoid%3D%40USERID%40 - Failed to load resource: net::ERR_CONNECTION_REFUSED",
                "timestamp": 1618807482327,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00b80067-007f-003c-00fb-0071001c00b4.png",
        "timestamp": 1618807456304,
        "duration": 26391
    },
    {
        "description": "Functionality of home page navigation bar|Assert and functionality check of delta navigation bar",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 8784,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "WARNING",
                "message": "https://www.delta.com/resources/c36db7c71763120c0d0265eb98f27f913a30d77a1d98e 18 Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check https://xhr.spec.whatwg.org/.",
                "timestamp": 1618807484090,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://gum.criteo.com/sync?c=327&a=1&r=1&u=https://pulse.delta.com/pc/delta/%3Fcw_criteoid%3D%40USERID%40 - Failed to load resource: net::ERR_CONNECTION_REFUSED",
                "timestamp": 1618807509295,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://www.delta.com/resources/c36db7c71763120c0d0265eb98f27f913a30d77a1d98e 18 Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check https://xhr.spec.whatwg.org/.",
                "timestamp": 1618807510956,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://gum.criteo.com/sync?c=327&a=1&r=1&u=https://pulse.delta.com/pc/delta/%3Fcw_criteoid%3D%40USERID%40 - Failed to load resource: net::ERR_CONNECTION_TIMED_OUT",
                "timestamp": 1618807538478,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.google.co.in/pagead/1p-user-list/1072374139/?guid=ON&script=0&data=medallion_status=;fare_class=;origin=;destination=;departure_date=;return_date=;pagetype=allpages;CabinType=&is_vtc=1&random=4225899179&ipr=y - Failed to load resource: net::ERR_CONNECTION_CLOSED",
                "timestamp": 1618807539689,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://www.delta.com/resources/c36db7c71763120c0d0265eb98f27f913a30d77a1d98e 18 Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check https://xhr.spec.whatwg.org/.",
                "timestamp": 1618807544825,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://delta-www.baynote.net/baynote/tags3/common?customerId=delta&code=www&timeout=undefined&onFailure=undefined - Failed to load resource: net::ERR_NAME_NOT_RESOLVED",
                "timestamp": 1618807546849,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://gum.criteo.com/sync?c=327&a=1&r=1&u=https://pulse.delta.com/pc/delta/%3Fcw_criteoid%3D%40USERID%40 - Failed to load resource: net::ERR_CONNECTION_REFUSED",
                "timestamp": 1618807570406,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://ad.doubleclick.net/ddm/activity/src=383639;type=delta167;cat=dlall;dc_lat=;dc_rdid=;tag_for_child_directed_treatment=;tfua=;npa=;ord=1;num=1? - Failed to load resource: net::ERR_CONNECTION_CLOSED",
                "timestamp": 1618807571052,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://www.delta.com/resources/c36db7c71763120c0d0265eb98f27f913a30d77a1d98e 18 Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check https://xhr.spec.whatwg.org/.",
                "timestamp": 1618807573059,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://www.delta.com/resources/c36db7c71763120c0d0265eb98f27f913a30d77a1d98e 18 Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check https://xhr.spec.whatwg.org/.",
                "timestamp": 1618807578686,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://gum.criteo.com/sync?c=327&a=1&r=1&u=https://pulse.delta.com/pc/delta/%3Fcw_criteoid%3D%40USERID%40 - Failed to load resource: net::ERR_CONNECTION_REFUSED",
                "timestamp": 1618807604078,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://www.delta.com/resources/c36db7c71763120c0d0265eb98f27f913a30d77a1d98e 18 Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check https://xhr.spec.whatwg.org/.",
                "timestamp": 1618807606075,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://gum.criteo.com/sync?c=327&a=1&r=1&u=https://pulse.delta.com/pc/delta/%3Fcw_criteoid%3D%40USERID%40 - Failed to load resource: net::ERR_CONNECTION_REFUSED",
                "timestamp": 1618807630900,
                "type": ""
            }
        ],
        "screenShotFile": "images\\009a00a1-00f0-00b8-0028-00bc003800d9.png",
        "timestamp": 1618807482942,
        "duration": 149390
    },
    {
        "description": "Assert Multiform|Assert Basic Components",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 8784,
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
                "timestamp": 1618807633394,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://delta-www.baynote.net/baynote/tags3/common?customerId=delta&code=www&timeout=undefined&onFailure=undefined - Failed to load resource: net::ERR_NAME_NOT_RESOLVED",
                "timestamp": 1618807634857,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.globalsqa.com/wp-content/cache/minify/72cc3.default.include.306296.js 0:0 Uncaught ReferenceError: jQuery is not defined",
                "timestamp": 1618807635316,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618807635564,
                "type": ""
            }
        ],
        "timestamp": 1618807634849,
        "duration": 12791
    },
    {
        "description": "Assert various Multiform|Assert Multiform Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 13748,
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
                "timestamp": 1618809371317,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618809373037,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00fe0008-00ce-00f4-00fb-00b7005300d4.png",
        "timestamp": 1618809369907,
        "duration": 18017
    },
    {
        "description": "Assert various search boxes and search result|Assert SearchFilter Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 13748,
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
                "timestamp": 1618809389333,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618809389570,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00bf0090-0086-005f-00cd-00a90019009f.png",
        "timestamp": 1618809388285,
        "duration": 5172
    },
    {
        "description": "Assert various searches and data in WebTable|Assert WebTable Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 13748,
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
                "timestamp": 1618809393818,
                "type": ""
            }
        ],
        "screenShotFile": "images\\002a00c9-00c4-00a6-0073-00ad0085007f.png",
        "timestamp": 1618809393608,
        "duration": 2840
    },
    {
        "description": "Signin with invalid username and password and assert the error labels|Assert RegistrationLogin Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 13748,
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
                "timestamp": 1618809396774,
                "type": ""
            }
        ],
        "screenShotFile": "images\\007700c0-001c-00c3-00aa-00ad00f10077.png",
        "timestamp": 1618809396574,
        "duration": 8159
    },
    {
        "description": "Assert login is successful, and assert the labels shown |Assert RegistrationLogin Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 13748,
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
                "timestamp": 1618809404918,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618809405082,
                "type": ""
            }
        ],
        "screenShotFile": "images\\0010001a-00cf-00ab-0005-00900071004a.png",
        "timestamp": 1618809404837,
        "duration": 9515
    },
    {
        "description": "Assert various search boxes and search result|Assert Scrollable Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 13748,
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
                "timestamp": 1618809414655,
                "type": ""
            }
        ],
        "screenShotFile": "images\\006900c6-0031-00f8-002b-00f200a50097.png",
        "timestamp": 1618809414453,
        "duration": 1974
    },
    {
        "description": "Assert and upload image|Assert UploadImage Section",
        "passed": false,
        "pending": false,
        "os": "Windows",
        "instanceId": 13748,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": [
            "Failed: invalid argument: File not found : C://Users//mindfire//Downloads//pp.jpg\n  (Session info: chrome=90.0.4430.72)\n  (Driver info: chromedriver=90.0.4430.24 (4c6d850f087da467d926e8eddb76550aed655991-refs/branch-heads/4430@{#429}),platform=Windows NT 10.0.19042 x86_64)"
        ],
        "trace": [
            "WebDriverError: invalid argument: File not found : C://Users//mindfire//Downloads//pp.jpg\n  (Session info: chrome=90.0.4430.72)\n  (Driver info: chromedriver=90.0.4430.24 (4c6d850f087da467d926e8eddb76550aed655991-refs/branch-heads/4430@{#429}),platform=Windows NT 10.0.19042 x86_64)\n    at Object.checkLegacyResponse (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\error.js:546:15)\n    at parseHttpResponse (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\http.js:509:13)\n    at C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\http.js:441:30\n    at runMicrotasks (<anonymous>)\n    at processTicksAndRejections (internal/process/task_queues.js:93:5)\nFrom: Task: WebElement.sendKeys()\n    at Driver.schedule (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\webdriver.js:807:17)\n    at WebElement.schedule_ (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\webdriver.js:2010:25)\n    at WebElement.sendKeys (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\webdriver.js:2174:19)\n    at actionFn (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\built\\element.js:89:44)\n    at Array.map (<anonymous>)\n    at C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\built\\element.js:461:65\n    at ManagedPromise.invokeCallback_ (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:1376:14)\n    at TaskQueue.execute_ (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:3084:14)\n    at TaskQueue.executeNext_ (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:3067:27)\n    at C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:2927:27Error\n    at ElementArrayFinder.applyAction_ (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\built\\element.js:459:27)\n    at ElementArrayFinder.<computed> [as sendKeys] (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\built\\element.js:91:29)\n    at ElementFinder.<computed> [as sendKeys] (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\built\\element.js:831:22)\n    at UserContext.<anonymous> (C:\\Users\\Jasvinder Singh\\Documents\\Project\\Test Cases\\Intermediate_Components_spec\\UploadImage_Spec.js:56:38)\n    at C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasminewd2\\index.js:112:25\n    at new ManagedPromise (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:1077:7)\n    at ControlFlow.promise (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:2505:12)\n    at schedulerExecute (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasminewd2\\index.js:95:18)\n    at TaskQueue.execute_ (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:3084:14)\n    at TaskQueue.executeNext_ (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:3067:27)\nFrom: Task: Run it(\"Assert and upload image\") in control flow\n    at UserContext.<anonymous> (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasminewd2\\index.js:94:19)\n    at attempt (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:4297:26)\n    at QueueRunner.run (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:4217:20)\n    at runNext (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:4257:20)\n    at C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:4264:13\n    at C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:4172:9\n    at C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasminewd2\\index.js:64:48\n    at ControlFlow.emit (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\events.js:62:21)\n    at ControlFlow.shutdown_ (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:2674:10)\n    at C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\selenium-webdriver\\lib\\promise.js:2599:53\nFrom asynchronous test: \nError\n    at Suite.<anonymous> (C:\\Users\\Jasvinder Singh\\Documents\\Project\\Test Cases\\Intermediate_Components_spec\\UploadImage_Spec.js:30:5)\n    at addSpecsToSuite (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:1107:25)\n    at Env.describe (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:1074:7)\n    at describe (C:\\Users\\Jasvinder Singh\\AppData\\Roaming\\npm\\node_modules\\protractor\\node_modules\\jasmine-core\\lib\\jasmine-core\\jasmine.js:4399:18)\n    at Object.<anonymous> (C:\\Users\\Jasvinder Singh\\Documents\\Project\\Test Cases\\Intermediate_Components_spec\\UploadImage_Spec.js:6:1)\n    at Module._compile (internal/modules/cjs/loader.js:1063:30)\n    at Object.Module._extensions..js (internal/modules/cjs/loader.js:1092:10)\n    at Module.load (internal/modules/cjs/loader.js:928:32)\n    at Function.Module._load (internal/modules/cjs/loader.js:769:14)"
        ],
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618809416701,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00220002-00ab-00d1-000f-009400b300e0.png",
        "timestamp": 1618809416522,
        "duration": 2204
    },
    {
        "description": "Functionality of Customer Transaction|Functionality of XYZ Bank Customer login",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 13748,
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
                "timestamp": 1618809418876,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618809418936,
                "type": ""
            }
        ],
        "screenShotFile": "images\\0041008c-005d-00c0-005b-006f005500e0.png",
        "timestamp": 1618809418804,
        "duration": 6132
    },
    {
        "description": "Functionality of Customer Deposit|Functionality of XYZ Bank Customer login",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 13748,
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
                "timestamp": 1618809425100,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618809425330,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00cd0043-002f-00f6-00e0-000000cd002c.png",
        "timestamp": 1618809425033,
        "duration": 2078
    },
    {
        "description": "Functionality of Customer Deposit|Functionality of XYZ Bank Customer login",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 13748,
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
                "timestamp": 1618809427402,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00d10011-0027-0052-008d-001400460069.png",
        "timestamp": 1618809427216,
        "duration": 2325
    },
    {
        "description": "click Home Page|XYZ Bank Home Page",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 13748,
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
                "timestamp": 1618809429762,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618809429964,
                "type": ""
            }
        ],
        "screenShotFile": "images\\007100ba-0039-00e1-00cd-00e2001c0068.png",
        "timestamp": 1618809429659,
        "duration": 1479
    },
    {
        "description": "AddCustomer section|click XYZ Bank Manager login",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 13748,
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
                "timestamp": 1618809431381,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618809431676,
                "type": ""
            }
        ],
        "screenShotFile": "images\\006d00e2-004a-0039-0073-00cd002b0027.png",
        "timestamp": 1618809431266,
        "duration": 3037
    },
    {
        "description": "OpenAccount section|click XYZ Bank Manager login",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 13748,
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
                "timestamp": 1618809435017,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618809435401,
                "type": ""
            }
        ],
        "screenShotFile": "images\\000a006d-005d-009b-003a-005b00fa0045.png",
        "timestamp": 1618809434455,
        "duration": 3517
    },
    {
        "description": "Customers section|click XYZ Bank Manager login",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 13748,
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
                "timestamp": 1618809438660,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618809438985,
                "type": ""
            }
        ],
        "screenShotFile": "images\\001900c0-000c-00ec-00e4-009e002100a2.png",
        "timestamp": 1618809438141,
        "duration": 3258
    },
    {
        "description": "Valid Consumption Calculations|Assert UploadImage Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 13748,
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
                "timestamp": 1618809441781,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618809442178,
                "type": ""
            }
        ],
        "screenShotFile": "images\\007100c7-00ef-0036-0061-007e0086009f.png",
        "timestamp": 1618809441576,
        "duration": 13297
    },
    {
        "description": "Invalid Consumption Calculations|Assert UploadImage Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 13748,
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
                "timestamp": 1618809455257,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00c10059-0082-0072-000c-00600053007e.png",
        "timestamp": 1618809454997,
        "duration": 2020
    },
    {
        "description": "Valid Simple Calculations|Assert UploadImage Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 13748,
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
                "timestamp": 1618809457219,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618809457269,
                "type": ""
            }
        ],
        "screenShotFile": "images\\0034006b-0061-007a-00e2-009f007000d7.png",
        "timestamp": 1618809457157,
        "duration": 4017
    },
    {
        "description": "Invalid Simple Calculations|Assert UploadImage Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 13748,
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
                "timestamp": 1618809461405,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618809461590,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00070046-001a-004b-000a-00c30083004c.png",
        "timestamp": 1618809461295,
        "duration": 1617
    },
    {
        "description": "Assert home page navigation bar|Assert Course selection home Page",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 13748,
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
                "timestamp": 1618809467276,
                "type": ""
            }
        ],
        "screenShotFile": "images\\005e00dd-0031-00e7-0056-0022001000da.png",
        "timestamp": 1618809463027,
        "duration": 9481
    },
    {
        "description": "functionality of home page navigation bar|Assert Course selection home Page",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 13748,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618809474748,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618809475909,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618809484536,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618809484537,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618809490428,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/sign_in - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618809490429,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://sso.teachable.com/ahoy/visits - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618809490429,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618809492288,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618809492290,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618809492290,
                "type": ""
            }
        ],
        "screenShotFile": "images\\0011005a-007a-005c-003a-00d500c500e5.png",
        "timestamp": 1618809472752,
        "duration": 20302
    },
    {
        "description": "Print course details|Assert Course selection",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 13748,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618809493434,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/sign_up - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618809493553,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://sso.teachable.com/secure/673/users/sign_up?reset_purchase_session=1 - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618809493623,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "deprecation 3 'window.webkitStorageInfo' is deprecated. Please use 'navigator.webkitTemporaryStorage' or 'navigator.webkitPersistentStorage' instead.",
                "timestamp": 1618809494676,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618809495878,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618809495880,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618809495880,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618809495880,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618809506838,
                "type": ""
            }
        ],
        "screenShotFile": "images\\0026007f-00e9-0039-0036-00590099000c.png",
        "timestamp": 1618809493546,
        "duration": 33673
    },
    {
        "description": "Print author name in dropdown|Assert Course selection",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 13748,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618809536809,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618809536811,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618809536811,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618809536812,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618809536813,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618809542248,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618809542248,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00ee007c-00c3-0002-00f9-0078002900e3.png",
        "timestamp": 1618809527502,
        "duration": 19835
    },
    {
        "description": "Assert all courses by searching protractor|Assert Course selection",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 13748,
        "browser": {
            "name": "chrome",
            "version": "90.0.4430.72"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618809548195,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618809548199,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618809548483,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618809548484,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618809548486,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618809548486,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618809548489,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618809549267,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618809554628,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618809559690,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618809566708,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618809571792,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618809576878,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618809582135,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00f300db-00fe-0033-009f-0084007100f8.png",
        "timestamp": 1618809547528,
        "duration": 34603
    },
    {
        "description": "Assert home page Journey Details|Assert and functionality check of Journey Details",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 13748,
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
                "timestamp": 1618809585265,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.delta.com/apac/en - Mixed Content: The page at 'https://www.delta.com/apac/en' was loaded over HTTPS, but requested an insecure XMLHttpRequest endpoint 'http://dpm.demdex.net/id/rd?d_visid_ver=2.3.0&d_fieldgroup=MC&d_rtbd=json&d_ver=2&d_verify=1&d_orgid=F0E65E09512D2CC50A490D4D%40AdobeOrg&d_nsid=0&ts=1618809585206'. This request has been blocked; the content must be served over HTTPS.",
                "timestamp": 1618809586153,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://gum.criteo.com/sync?c=327&a=1&r=1&u=https://pulse.delta.com/pc/delta/%3Fcw_criteoid%3D%40USERID%40 - Failed to load resource: net::ERR_CONNECTION_TIMED_OUT",
                "timestamp": 1618809611730,
                "type": ""
            }
        ],
        "screenShotFile": "images\\006600d8-0040-00ac-00db-0089005c00cc.png",
        "timestamp": 1618809582344,
        "duration": 29617
    },
    {
        "description": "Assert various Multiform|Assert Multiform Section",
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
                "timestamp": 1618809803760,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618809805177,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00170012-001c-0098-00f6-001f002a0034.png",
        "timestamp": 1618809801694,
        "duration": 16077
    },
    {
        "description": "Assert various search boxes and search result|Assert SearchFilter Section",
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
                "timestamp": 1618809819072,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618809819227,
                "type": ""
            }
        ],
        "screenShotFile": "images\\0090002c-0017-0052-0089-0040000100ba.png",
        "timestamp": 1618809818063,
        "duration": 5287
    },
    {
        "description": "Assert various searches and data in WebTable|Assert WebTable Section",
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
                "timestamp": 1618809823505,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618809823638,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00d700a1-0001-0091-008c-009c001b0084.png",
        "timestamp": 1618809823464,
        "duration": 2935
    },
    {
        "description": "Signin with invalid username and password and assert the error labels|Assert RegistrationLogin Section",
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
                "timestamp": 1618809826555,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618809826692,
                "type": ""
            }
        ],
        "screenShotFile": "images\\008f0072-0013-00b8-00db-0061002b00b4.png",
        "timestamp": 1618809826517,
        "duration": 9075
    },
    {
        "description": "Assert login is successful, and assert the labels shown |Assert RegistrationLogin Section",
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
                "timestamp": 1618809835752,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618809835933,
                "type": ""
            }
        ],
        "screenShotFile": "images\\003400ae-0050-00af-003e-003100c7002c.png",
        "timestamp": 1618809835694,
        "duration": 10386
    },
    {
        "description": "Assert various search boxes and search result|Assert Scrollable Section",
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
                "timestamp": 1618809846253,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618809846358,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00a700e6-0062-005a-00ce-00130037009d.png",
        "timestamp": 1618809846190,
        "duration": 2885
    },
    {
        "description": "Assert and upload image|Assert UploadImage Section",
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
                "timestamp": 1618809849243,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618809849359,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00340097-0025-006d-00e9-00e3003f001e.png",
        "timestamp": 1618809849184,
        "duration": 2960
    },
    {
        "description": "Functionality of Customer Transaction|Functionality of XYZ Bank Customer login",
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
                "timestamp": 1618809852352,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618809852482,
                "type": ""
            }
        ],
        "screenShotFile": "images\\008300f9-0058-0087-000b-0054000700c0.png",
        "timestamp": 1618809852310,
        "duration": 5243
    },
    {
        "description": "Functionality of Customer Deposit|Functionality of XYZ Bank Customer login",
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
                "timestamp": 1618809857710,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618809857924,
                "type": ""
            }
        ],
        "screenShotFile": "images\\007f004f-0081-0008-0041-0085005f0096.png",
        "timestamp": 1618809857650,
        "duration": 1894
    },
    {
        "description": "Functionality of Customer Deposit|Functionality of XYZ Bank Customer login",
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
                "timestamp": 1618809859720,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618809859908,
                "type": ""
            }
        ],
        "screenShotFile": "images\\000400b0-0076-0051-004e-000600ac0012.png",
        "timestamp": 1618809859649,
        "duration": 1844
    },
    {
        "description": "click Home Page|XYZ Bank Home Page",
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
                "timestamp": 1618809861684,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618809861883,
                "type": ""
            }
        ],
        "screenShotFile": "images\\003c001e-00bb-007a-0089-009500080040.png",
        "timestamp": 1618809861606,
        "duration": 966
    },
    {
        "description": "AddCustomer section|click XYZ Bank Manager login",
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
                "timestamp": 1618809862760,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618809862967,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00e900a2-006d-0033-0004-00ff001800f8.png",
        "timestamp": 1618809862681,
        "duration": 2726
    },
    {
        "description": "OpenAccount section|click XYZ Bank Manager login",
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
                "timestamp": 1618809866524,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618809866704,
                "type": ""
            }
        ],
        "screenShotFile": "images\\006500fd-005b-0064-0021-00a200d70057.png",
        "timestamp": 1618809865533,
        "duration": 2525
    },
    {
        "description": "Customers section|click XYZ Bank Manager login",
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
                "timestamp": 1618809868864,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618809869054,
                "type": ""
            }
        ],
        "screenShotFile": "images\\0095008a-0043-0069-0019-007b000000a4.png",
        "timestamp": 1618809868171,
        "duration": 2577
    },
    {
        "description": "Valid Consumption Calculations|Assert UploadImage Section",
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
                "timestamp": 1618809870928,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618809871140,
                "type": ""
            }
        ],
        "screenShotFile": "images\\001a00da-0090-00bd-00c9-00eb004e005f.png",
        "timestamp": 1618809870850,
        "duration": 3488
    },
    {
        "description": "Invalid Consumption Calculations|Assert UploadImage Section",
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
                "timestamp": 1618809874518,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618809874564,
                "type": ""
            }
        ],
        "screenShotFile": "images\\0076007f-0030-0060-0099-003c00710041.png",
        "timestamp": 1618809874469,
        "duration": 1492
    },
    {
        "description": "Valid Simple Calculations|Assert UploadImage Section",
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
                "timestamp": 1618809876149,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618809876191,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00a500cf-009f-00c3-0034-00710087001d.png",
        "timestamp": 1618809876082,
        "duration": 2046
    },
    {
        "description": "Invalid Simple Calculations|Assert UploadImage Section",
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
                "timestamp": 1618809878308,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618809878514,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00e4004c-004f-0013-0035-008200fe0040.png",
        "timestamp": 1618809878225,
        "duration": 1450
    },
    {
        "description": "Assert home page navigation bar|Assert Course selection home Page",
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
                "message": "https://www.selenium-tutorial.com/ahoy/visits - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618809883240,
                "type": ""
            }
        ],
        "screenShotFile": "images\\006a0092-0006-00bd-00d1-005b005b0047.png",
        "timestamp": 1618809879789,
        "duration": 6310
    },
    {
        "description": "functionality of home page navigation bar|Assert Course selection home Page",
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
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618809887874,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618809894395,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618809894403,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618809899892,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/sign_in - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618809899894,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://sso.teachable.com/ahoy/visits - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618809899895,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618809900856,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618809900857,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618809900872,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00c400c9-00ee-00f0-004d-00f0003000ec.png",
        "timestamp": 1618809886457,
        "duration": 14967
    },
    {
        "description": "Print course details|Assert Course selection",
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
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618809901970,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/sign_up - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618809902572,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://sso.teachable.com/secure/673/users/sign_up?reset_purchase_session=1 - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618809902775,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "deprecation 3 'window.webkitStorageInfo' is deprecated. Please use 'navigator.webkitTemporaryStorage' or 'navigator.webkitPersistentStorage' instead.",
                "timestamp": 1618809913161,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://sso.teachable.com/cdn-cgi/challenge-platform/h/b/orchestrate/captcha/v1?ray=6423b5c3bdf22e47 0 chrome.loadTimes() is deprecated, instead use standardized API: Navigation Timing 2. https://www.chromestatus.com/features/5637885046816768.",
                "timestamp": 1618809913161,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://sso.teachable.com/cdn-cgi/challenge-platform/h/b/orchestrate/captcha/v1?ray=6423b5c3bdf22e47 0 chrome.loadTimes() is deprecated, instead use standardized API: Navigation Timing 2. https://www.chromestatus.com/features/5637885046816768.",
                "timestamp": 1618809913161,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://sso.teachable.com/cdn-cgi/challenge-platform/h/b/orchestrate/captcha/v1?ray=6423b5c3bdf22e47 0 chrome.loadTimes() is deprecated, instead use standardized API: Navigation Timing 2. https://www.chromestatus.com/features/5637885046816768.",
                "timestamp": 1618809913161,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://sso.teachable.com/cdn-cgi/challenge-platform/h/b/orchestrate/captcha/v1?ray=6423b5c3bdf22e47 0 chrome.loadTimes() is deprecated, instead use standardized API: Navigation Timing 2. https://www.chromestatus.com/features/5637885046816768.",
                "timestamp": 1618809913161,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://sso.teachable.com/cdn-cgi/challenge-platform/h/b/orchestrate/captcha/v1?ray=6423b5c3bdf22e47 0 chrome.loadTimes() is deprecated, instead use standardized API: Navigation Timing 2. https://www.chromestatus.com/features/5637885046816768.",
                "timestamp": 1618809913161,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://sso.teachable.com/cdn-cgi/challenge-platform/h/b/orchestrate/captcha/v1?ray=6423b5c3bdf22e47 0 chrome.loadTimes() is deprecated, instead use standardized API: Paint Timing. https://www.chromestatus.com/features/5637885046816768.",
                "timestamp": 1618809913161,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://sso.teachable.com/cdn-cgi/challenge-platform/h/b/orchestrate/captcha/v1?ray=6423b5c3bdf22e47 0 chrome.loadTimes() is deprecated, instead use standardized API: Paint Timing. https://www.chromestatus.com/features/5637885046816768.",
                "timestamp": 1618809913162,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://sso.teachable.com/cdn-cgi/challenge-platform/h/b/orchestrate/captcha/v1?ray=6423b5c3bdf22e47 0 chrome.loadTimes() is deprecated, instead use standardized API: Navigation Timing 2. https://www.chromestatus.com/features/5637885046816768.",
                "timestamp": 1618809913162,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://sso.teachable.com/cdn-cgi/challenge-platform/h/b/orchestrate/captcha/v1?ray=6423b5c3bdf22e47 0 chrome.loadTimes() is deprecated, instead use standardized API: nextHopProtocol in Navigation Timing 2. https://www.chromestatus.com/features/5637885046816768.",
                "timestamp": 1618809913162,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://sso.teachable.com/cdn-cgi/challenge-platform/h/b/orchestrate/captcha/v1?ray=6423b5c3bdf22e47 0 chrome.loadTimes() is deprecated, instead use standardized API: nextHopProtocol in Navigation Timing 2. https://www.chromestatus.com/features/5637885046816768.",
                "timestamp": 1618809913162,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://sso.teachable.com/cdn-cgi/challenge-platform/h/b/orchestrate/captcha/v1?ray=6423b5c3bdf22e47 0 chrome.loadTimes() is deprecated, instead use standardized API: nextHopProtocol in Navigation Timing 2. https://www.chromestatus.com/features/5637885046816768.",
                "timestamp": 1618809913162,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://sso.teachable.com/cdn-cgi/challenge-platform/h/b/orchestrate/captcha/v1?ray=6423b5c3bdf22e47 0 chrome.loadTimes() is deprecated, instead use standardized API: nextHopProtocol in Navigation Timing 2. https://www.chromestatus.com/features/5637885046816768.",
                "timestamp": 1618809913162,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://sso.teachable.com/cdn-cgi/challenge-platform/h/b/orchestrate/captcha/v1?ray=6423b5c3bdf22e47 0 chrome.loadTimes() is deprecated, instead use standardized API: Navigation Timing 2. https://www.chromestatus.com/features/5637885046816768.",
                "timestamp": 1618809913162,
                "type": ""
            }
        ],
        "screenShotFile": "images\\005100f7-0095-0065-0091-005500e30013.png",
        "timestamp": 1618809901716,
        "duration": 31559
    },
    {
        "description": "Print author name in dropdown|Assert Course selection",
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
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618809954727,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618809954728,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618809954728,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618809954728,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618809960238,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618809960238,
                "type": ""
            }
        ],
        "screenShotFile": "images\\0059007f-00dc-00a3-00ed-00a000100062.png",
        "timestamp": 1618809933386,
        "duration": 31953
    },
    {
        "description": "Assert all courses by searching protractor|Assert Course selection",
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
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618809967240,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618809967240,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618809967240,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618809967240,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618809967242,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618809967266,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618809968350,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618809974011,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618809979190,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618809985309,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618809990399,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618809995450,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618810000753,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00370076-00e8-005e-0033-00d700f50053.png",
        "timestamp": 1618809965525,
        "duration": 35225
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
