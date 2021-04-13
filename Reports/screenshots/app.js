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
        "instanceId": 1980,
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
                "timestamp": 1618289192877,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 66:977 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618289193971,
                "type": ""
            }
        ],
        "screenShotFile": "images\\006e0039-0024-0092-0003-00af00ef00e9.png",
        "timestamp": 1618289190718,
        "duration": 17332
    },
    {
        "description": "Assert various search boxes and search result|Assert SearchFilter Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 1980,
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
                "timestamp": 1618289209867,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618289210175,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00880098-0065-00e1-008a-008200030037.png",
        "timestamp": 1618289208555,
        "duration": 5545
    },
    {
        "description": "Assert various searches and data in WebTable|Assert WebTable Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 1980,
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
                "timestamp": 1618289215391,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618289215588,
                "type": ""
            }
        ],
        "screenShotFile": "images\\008a001b-0091-00bf-007d-008e007a007e.png",
        "timestamp": 1618289214534,
        "duration": 4594
    },
    {
        "description": "Signin with invalid username and password and assert the error labels|Assert RegistrationLogin Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 1980,
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
                "timestamp": 1618289220189,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618289220372,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00b800ae-00af-007f-00e6-00d7000000c5.png",
        "timestamp": 1618289219672,
        "duration": 10108
    },
    {
        "description": "Assert login is successful, and assert the labels shown |Assert RegistrationLogin Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 1980,
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
                "timestamp": 1618289230845,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00d20092-00a4-007d-0089-0059000a00d1.png",
        "timestamp": 1618289230108,
        "duration": 10607
    },
    {
        "description": "Assert various search boxes and search result|Assert Scrollable Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 1980,
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
                "timestamp": 1618289242860,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618289243016,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00d90068-006f-0097-0077-009300610015.png",
        "timestamp": 1618289241063,
        "duration": 5062
    },
    {
        "description": "Assert and upload image|Assert UploadImage Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 1980,
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
                "timestamp": 1618289247451,
                "type": ""
            }
        ],
        "screenShotFile": "images\\004f0023-0076-00f9-008c-00ee00f90067.png",
        "timestamp": 1618289246492,
        "duration": 4732
    },
    {
        "description": "Functionality of Customer Transaction|Functionality of XYZ Bank Customer login",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 1980,
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
                "timestamp": 1618289252663,
                "type": ""
            }
        ],
        "screenShotFile": "images\\004500cc-006f-0053-00c3-004c00810005.png",
        "timestamp": 1618289251589,
        "duration": 8959
    },
    {
        "description": "Functionality of Customer Deposit|Functionality of XYZ Bank Customer login",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 1980,
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
                "timestamp": 1618289261509,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618289261719,
                "type": ""
            }
        ],
        "screenShotFile": "images\\007f002d-0026-0009-002d-0046000300aa.png",
        "timestamp": 1618289260877,
        "duration": 3281
    },
    {
        "description": "Functionality of Customer Deposit|Functionality of XYZ Bank Customer login",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 1980,
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
                "timestamp": 1618289265058,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618289265247,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00d600b7-003d-0095-00a7-007d009900f7.png",
        "timestamp": 1618289264519,
        "duration": 2933
    },
    {
        "description": "click Home Page|XYZ Bank Home Page",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 1980,
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
                "timestamp": 1618289268508,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618289268618,
                "type": ""
            }
        ],
        "screenShotFile": "images\\0037007c-0027-0039-00ef-00b600fb005f.png",
        "timestamp": 1618289267779,
        "duration": 1531
    },
    {
        "description": "AddCustomer section|click XYZ Bank Manager login",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 1980,
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
                "timestamp": 1618289270540,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00fd00ad-0045-0055-00c7-00c10086004f.png",
        "timestamp": 1618289269639,
        "duration": 2898
    },
    {
        "description": "OpenAccount section|click XYZ Bank Manager login",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 1980,
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
                "timestamp": 1618289274094,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00cf0004-00da-00db-0037-0060006b0028.png",
        "timestamp": 1618289272881,
        "duration": 2689
    },
    {
        "description": "Customers section|click XYZ Bank Manager login",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 1980,
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
                "timestamp": 1618289277732,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618289277843,
                "type": ""
            }
        ],
        "screenShotFile": "images\\0069009c-0097-00d4-00ee-00bf00bc000c.png",
        "timestamp": 1618289275932,
        "duration": 3126
    },
    {
        "description": "Valid Consumption Calculations|Assert UploadImage Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 1980,
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
                "timestamp": 1618289280090,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618289280265,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00d20016-0067-00d0-0099-0020009c0009.png",
        "timestamp": 1618289279420,
        "duration": 4696
    },
    {
        "description": "Invalid Consumption Calculations|Assert UploadImage Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 1980,
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
                "timestamp": 1618289285043,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618289285209,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00f900ed-00d3-0066-0039-00c500ed002d.png",
        "timestamp": 1618289284481,
        "duration": 2121
    },
    {
        "description": "Valid Simple Calculations|Assert UploadImage Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 1980,
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
                "timestamp": 1618289287479,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618289287646,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00ad0063-0034-0052-0075-004700e1008a.png",
        "timestamp": 1618289286961,
        "duration": 4272
    },
    {
        "description": "Invalid Simple Calculations|Assert UploadImage Section",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 1980,
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
                "timestamp": 1618289292574,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618289292754,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00370046-00c4-0070-00b5-00c400ec0088.png",
        "timestamp": 1618289291595,
        "duration": 2259
    },
    {
        "description": "Assert home page navigation bar|Assert Course selection home Page",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 1980,
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
                "timestamp": 1618289298910,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00bf0010-0035-00d0-00b9-00a1006e005c.png",
        "timestamp": 1618289294167,
        "duration": 16316
    },
    {
        "description": "functionality of home page navigation bar|Assert Course selection home Page",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 1980,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618289312504,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618289324209,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618289324210,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618289329892,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/sign_in - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618289329895,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://sso.teachable.com/ahoy/visits - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618289331449,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618289337161,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618289337161,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618289337162,
                "type": ""
            }
        ],
        "screenShotFile": "images\\005300ec-0035-00ed-00d5-008500e30007.png",
        "timestamp": 1618289310976,
        "duration": 26720
    },
    {
        "description": "Print course details|Assert Course selection",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 1980,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618289338259,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/sign_up - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618289339074,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618289339333,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618289339340,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618289339343,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618289339407,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618289349809,
                "type": ""
            }
        ],
        "screenShotFile": "images\\001d0054-00f1-001b-0080-009e003900eb.png",
        "timestamp": 1618289338244,
        "duration": 32007
    },
    {
        "description": "Print author name in dropdown|Assert Course selection",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 1980,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618289371392,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618289371429,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618289371438,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618289371439,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618289371472,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618289376846,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618289376847,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00580085-0007-009c-0028-00d900f40079.png",
        "timestamp": 1618289370704,
        "duration": 11320
    },
    {
        "description": "Assert all courses by searching protractor|Assert Course selection",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 1980,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618289384212,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618289384350,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618289384350,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618289384429,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618289385156,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618289385251,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618289385280,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618289385355,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618289392114,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618289397205,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618289404165,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618289409249,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618289414371,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://www.selenium-tutorial.com/ahoy/events - Failed to load resource: the server responded with a status of 403 ()",
                "timestamp": 1618289419733,
                "type": ""
            }
        ],
        "screenShotFile": "images\\003c00f3-002f-00d1-0097-006e004d00ac.png",
        "timestamp": 1618289382445,
        "duration": 37283
    },
    {
        "description": "Assert home page Journey Details|Assert and functionality check of Journey Details",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 1980,
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
                "timestamp": 1618289426140,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://gum.criteo.com/sync?c=327&a=1&r=1&u=https://pulse.delta.com/pc/delta/%3Fcw_criteoid%3D%40USERID%40 - Failed to load resource: net::ERR_CONNECTION_TIMED_OUT",
                "timestamp": 1618289454917,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00cf0079-009f-0036-0067-002e00bb0066.png",
        "timestamp": 1618289420163,
        "duration": 34999
    },
    {
        "description": "Assert home page navigation bar|Assert and functionality check of delta navigation bar",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 1980,
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
                "timestamp": 1618289458310,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://gum.criteo.com/sync?c=327&a=1&r=1&u=https://pulse.delta.com/pc/delta/%3Fcw_criteoid%3D%40USERID%40 - Failed to load resource: net::ERR_CONNECTION_TIMED_OUT",
                "timestamp": 1618289485456,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00360057-00dd-00c4-00ce-00d600d700d5.png",
        "timestamp": 1618289455514,
        "duration": 30364
    },
    {
        "description": "Functionality of home page navigation bar|Assert and functionality check of delta navigation bar",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 1980,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "WARNING",
                "message": "https://www.delta.com/resources/f8309c9ed363120c0d0265eb98f27f913a30d77a1d98e 18 Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check https://xhr.spec.whatwg.org/.",
                "timestamp": 1618289487234,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://gum.criteo.com/sync?c=327&a=1&r=1&u=https://pulse.delta.com/pc/delta/%3Fcw_criteoid%3D%40USERID%40 - Failed to load resource: net::ERR_CONNECTION_REFUSED",
                "timestamp": 1618289513489,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://www.delta.com/resources/f8309c9ed363120c0d0265eb98f27f913a30d77a1d98e 18 Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check https://xhr.spec.whatwg.org/.",
                "timestamp": 1618289515036,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://gum.criteo.com/sync?c=327&a=1&r=1&u=https://pulse.delta.com/pc/delta/%3Fcw_criteoid%3D%40USERID%40 - Failed to load resource: net::ERR_CONNECTION_REFUSED",
                "timestamp": 1618289540537,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://fonts.googleapis.com/css?family=Open+Sans:400,300,600 - Failed to load resource: net::ERR_CONNECTION_CLOSED",
                "timestamp": 1618289543539,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://www.delta.com/resources/f8309c9ed363120c0d0265eb98f27f913a30d77a1d98e 18 Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check https://xhr.spec.whatwg.org/.",
                "timestamp": 1618289544556,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://delta-www.baynote.net/baynote/tags3/common?customerId=delta&code=www&timeout=undefined&onFailure=undefined - Failed to load resource: net::ERR_NAME_NOT_RESOLVED",
                "timestamp": 1618289546375,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://gum.criteo.com/sync?c=327&a=1&r=1&u=https://pulse.delta.com/pc/delta/%3Fcw_criteoid%3D%40USERID%40 - Failed to load resource: net::ERR_CONNECTION_REFUSED",
                "timestamp": 1618289569544,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://adservice.google.com/ddm/fls/z/src=383639;dc_pre=COn4xre2-u8CFYA3twAdP-QPEQ;type=delta167;cat=dlall;dc_lat=;dc_rdid=;tag_for_child_directed_treatment=;tfua=;npa=;ord=1;num=1 - Failed to load resource: net::ERR_CONNECTION_CLOSED",
                "timestamp": 1618289570388,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://www.delta.com/resources/f8309c9ed363120c0d0265eb98f27f913a30d77a1d98e 18 Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check https://xhr.spec.whatwg.org/.",
                "timestamp": 1618289571260,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://www.delta.com/resources/f8309c9ed363120c0d0265eb98f27f913a30d77a1d98e 18 Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check https://xhr.spec.whatwg.org/.",
                "timestamp": 1618289575580,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://gum.criteo.com/sync?c=327&a=1&r=1&u=https://pulse.delta.com/pc/delta/%3Fcw_criteoid%3D%40USERID%40 - Failed to load resource: net::ERR_CONNECTION_REFUSED",
                "timestamp": 1618289601334,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://www.delta.com/resources/f8309c9ed363120c0d0265eb98f27f913a30d77a1d98e 18 Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check https://xhr.spec.whatwg.org/.",
                "timestamp": 1618289603188,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://gum.criteo.com/sync?c=327&a=1&r=1&u=https://pulse.delta.com/pc/delta/%3Fcw_criteoid%3D%40USERID%40 - Failed to load resource: net::ERR_CONNECTION_REFUSED",
                "timestamp": 1618289628608,
                "type": ""
            }
        ],
        "screenShotFile": "images\\003400b5-0054-0004-000c-00d700170018.png",
        "timestamp": 1618289486245,
        "duration": 143866
    },
    {
        "description": "Assert Home page navigation bar|Amazon Homepage",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 1980,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://fonts.googleapis.com/css?family=Open+Sans:400,300,600 - Failed to load resource: net::ERR_CONNECTION_CLOSED",
                "timestamp": 1618289631175,
                "type": ""
            },
            {
                "level": "WARNING",
                "message": "https://www.delta.com/resources/f8309c9ed363120c0d0265eb98f27f913a30d77a1d98e 18 Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check https://xhr.spec.whatwg.org/.",
                "timestamp": 1618289631554,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://delta-www.baynote.net/baynote/tags3/common?customerId=delta&code=www&timeout=undefined&onFailure=undefined - Failed to load resource: net::ERR_NAME_NOT_RESOLVED",
                "timestamp": 1618289633013,
                "type": ""
            }
        ],
        "screenShotFile": "images\\0046005f-00ff-0032-002f-00f800890034.png",
        "timestamp": 1618289633328,
        "duration": 7722
    },
    {
        "description": "Functionality of navigation bar|Amazon Homepage",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 1980,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed",
        "browserLogs": [],
        "screenShotFile": "images\\006900cb-0008-0036-00ac-008d009e0085.png",
        "timestamp": 1618289641538,
        "duration": 16470
    },
    {
        "description": "Functionality of sub-navigation bar|Amazon Homepage",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 1980,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed",
        "browserLogs": [
            {
                "level": "SEVERE",
                "message": "https://images-eu.ssl-images-amazon.com/images/G/31/acs/ux/widget/buyingguide/h1/testing/fisherprice.png - Failed to load resource: the server responded with a status of 404 ()",
                "timestamp": 1618289695259,
                "type": ""
            }
        ],
        "screenShotFile": "images\\00e30032-002b-00e1-00f5-00c3000e0055.png",
        "timestamp": 1618289658362,
        "duration": 46891
    },
    {
        "description": "Assert All items section|Assert Sub-Navigation bar sections",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 1980,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [],
        "screenShotFile": "images\\005c009e-003c-001f-0019-002e000d00f6.png",
        "timestamp": 1618289705749,
        "duration": 8609
    },
    {
        "description": "Assert Bestseller Section|Assert Sub-Navigation bar sections",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 1980,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [],
        "screenShotFile": "images\\00e600b2-001a-003c-0063-00c200c00035.png",
        "timestamp": 1618289714920,
        "duration": 2674
    },
    {
        "description": "Assert Mobiles Section|Assert Sub-Navigation bar sections",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 1980,
        "browser": {
            "name": "chrome",
            "version": "89.0.4389.114"
        },
        "message": "Passed.",
        "trace": "",
        "browserLogs": [],
        "screenShotFile": "images\\00910006-0063-006c-003d-00470075000c.png",
        "timestamp": 1618289717948,
        "duration": 3430
    },
    {
        "description": "Assert Multiform|Assert Basic Components",
        "passed": true,
        "pending": false,
        "os": "Windows",
        "instanceId": 1980,
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
                "timestamp": 1618289723279,
                "type": ""
            },
            {
                "level": "SEVERE",
                "message": "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js 219:117 Uncaught P: adsbygoogle.push() error: Only one 'enable_page_level_ads' allowed per page.",
                "timestamp": 1618289723602,
                "type": ""
            }
        ],
        "timestamp": 1618289721975,
        "duration": 13612
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
