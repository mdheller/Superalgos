﻿exports.newFoundationsBotModulesCandlesVolumesMultiTimeFrameMarket = function (processIndex) {

    const MODULE_NAME = "Candles Volumes Multi Time Frame Market"
    const CANDLES_FOLDER_NAME = "Candles"
    const CANDLES_ONE_MIN = "One-Min"
    const VOLUMES_FOLDER_NAME = "Volumes"
    const VOLUMES_ONE_MIN = "One-Min"

    let thisObject = {
        initialize: initialize,
        start: start
    }

    let fileStorage = TS.projects.foundations.taskModules.fileStorage.newFileStorage(processIndex);
    let statusDependenciesModule;
    let beginingOfMarket

    return thisObject;

    function initialize(pStatusDependenciesModule, callBackFunction) {
        try {
            statusDependenciesModule = pStatusDependenciesModule;
            callBackFunction(TS.projects.foundations.globals.standardResponses.DEFAULT_OK_RESPONSE);
        } catch (err) {
            TS.projects.foundations.globals.processVariables.VARIABLES_BY_PROCESS_INDEX_MAP.get(processIndex).UNEXPECTED_ERROR = err
            TS.projects.foundations.globals.loggerVariables.VARIABLES_BY_PROCESS_INDEX_MAP.get(processIndex).BOT_MAIN_LOOP_LOGGER_MODULE_OBJECT.write(MODULE_NAME,
                "[ERROR] initialize -> err = " + err.stack);
            callBackFunction(TS.projects.foundations.globals.standardResponses.DEFAULT_FAIL_RESPONSE);
        }
    }

    /*
        This process is going to do the following:
    
        Read the candles and volumes from Exchange Raw Data and produce a single Index File 
        for Market Period. But this is the situation:
    
        Exchange Raw Data has a dataset organized with daily files with candles of 1 min. 
        Candles Volumes is writing in this process a single file for each timeFrame for the whole market.
        Everytime this process run, must be able to resume its job and process everything pending until 
        reaching the head of the market. So the tactic to do this is the
        following:
    
        1. First we need to read the last file written by this process, and load all the information into 
        in-memory arrays. We will then append to this arrays the new information we will get from Exchange Raw Data.
    
        2. We know from our status report which was the last DAY we processed from Exchange Raw Data, 
        but we must be carefull, because that day might  not have been completed yet, if the
        last loop found the head of the market. That means that we have to be carefull not to append candles 
        that are already there. To simplify what we do is to discard all candles of the last processed day, 
        and then we can process that full day again adding all the candles.
    */

    function start(callBackFunction) {

        try {
            /* Context Variables */
            let contextVariables = {
                datetimeLastProducedFile: undefined,                        // Datetime of the last file files successfully produced by this process.
                datetimeBeginingOfMarketFile: undefined,                    // Datetime of the first trade file in the whole market history.
                datetimeLastAvailableDependencyFile: undefined              // Datetime of the last file available to be used as an input of this process.
            };

            getContextVariables();

            function getContextVariables() {
                try {
                    let thisReport
                    let statusReport

                    /* We look first for Exchange Raw Data in order to get when the market starts. */
                    statusReport = statusDependenciesModule.reportsByMainUtility.get('Market Starting Point')

                    if (statusReport === undefined) { // This means the status report does not exist, that could happen for instance at the begining of a month.
                        TS.projects.foundations.globals.loggerVariables.VARIABLES_BY_PROCESS_INDEX_MAP.get(processIndex).BOT_MAIN_LOOP_LOGGER_MODULE_OBJECT.write(MODULE_NAME,
                            "[WARN] start -> getContextVariables -> Status Report does not exist. Retrying Later. ");
                        callBackFunction(TS.projects.foundations.globals.standardResponses.DEFAULT_RETRY_RESPONSE);
                        return
                    }

                    if (statusReport.status === "Status Report is corrupt.") {
                        TS.projects.foundations.globals.loggerVariables.VARIABLES_BY_PROCESS_INDEX_MAP.get(processIndex).BOT_MAIN_LOOP_LOGGER_MODULE_OBJECT.write(MODULE_NAME,
                            "[ERROR] start -> getContextVariables -> Can not continue because dependecy Status Report is corrupt. ");
                        callBackFunction(TS.projects.foundations.globals.standardResponses.DEFAULT_RETRY_RESPONSE);
                        return
                    }

                    thisReport = statusReport.file

                    if (thisReport.beginingOfMarket === undefined) {
                        TS.projects.foundations.globals.loggerVariables.VARIABLES_BY_PROCESS_INDEX_MAP.get(processIndex).BOT_MAIN_LOOP_LOGGER_MODULE_OBJECT.write(MODULE_NAME,
                            "[HINT] start -> getContextVariables -> It is too early too run this process since the trade history of the market is not there yet.");

                        let customOK = {
                            result: TS.projects.foundations.globals.standardResponses.CUSTOM_OK_RESPONSE.result,
                            message: "Dependency does not exist."
                        }
                        TS.projects.foundations.globals.loggerVariables.VARIABLES_BY_PROCESS_INDEX_MAP.get(processIndex).BOT_MAIN_LOOP_LOGGER_MODULE_OBJECT.write(MODULE_NAME,
                            "[WARN] start -> getContextVariables -> customOK = " + customOK.message);
                        callBackFunction(customOK)
                        return
                    }

                    contextVariables.datetimeBeginingOfMarketFile = new Date(
                        thisReport.beginingOfMarket.year + "-" +
                        thisReport.beginingOfMarket.month + "-" +
                        thisReport.beginingOfMarket.days + " " +
                        thisReport.beginingOfMarket.hours + ":" +
                        thisReport.beginingOfMarket.minutes +
                        TS.projects.foundations.globals.timeConstants.GMT_SECONDS);

                    /* Second, we get the report from Exchange Raw Data, to know when the marted ends. */
                    statusReport = statusDependenciesModule.reportsByMainUtility.get('Market Ending Point')

                    if (statusReport === undefined) { // This means the status report does not exist, that could happen for instance at the begining of a month.
                        TS.projects.foundations.globals.loggerVariables.VARIABLES_BY_PROCESS_INDEX_MAP.get(processIndex).BOT_MAIN_LOOP_LOGGER_MODULE_OBJECT.write(MODULE_NAME,
                            "[WARN] start -> getContextVariables -> Status Report does not exist. Retrying Later. ");
                        callBackFunction(TS.projects.foundations.globals.standardResponses.DEFAULT_RETRY_RESPONSE);
                        return;
                    }

                    if (statusReport.status === "Status Report is corrupt.") {
                        TS.projects.foundations.globals.loggerVariables.VARIABLES_BY_PROCESS_INDEX_MAP.get(processIndex).BOT_MAIN_LOOP_LOGGER_MODULE_OBJECT.write(MODULE_NAME,
                            "[ERROR] start -> getContextVariables -> Can not continue because dependecy Status Report is corrupt. ");
                        callBackFunction(TS.projects.foundations.globals.standardResponses.DEFAULT_RETRY_RESPONSE);
                        return;
                    }

                    thisReport = statusReport.file

                    if (thisReport.lastFile === undefined) {
                        let customOK = {
                            result: TS.projects.foundations.globals.standardResponses.CUSTOM_OK_RESPONSE.result,
                            message: "Dependency not ready."
                        }
                        TS.projects.foundations.globals.loggerVariables.VARIABLES_BY_PROCESS_INDEX_MAP.get(processIndex).BOT_MAIN_LOOP_LOGGER_MODULE_OBJECT.write(MODULE_NAME,
                            "[WARN] start -> getContextVariables -> customOK = " + customOK.message);
                        callBackFunction(customOK);
                        return;
                    }

                    contextVariables.datetimeLastAvailableDependencyFile = new Date(
                        thisReport.lastFile.year + "-" +
                        thisReport.lastFile.month + "-" +
                        thisReport.lastFile.days + " " + "00:00" +
                        TS.projects.foundations.globals.timeConstants.GMT_SECONDS);

                    /* Finally we get our own Status Report. */
                    statusReport = statusDependenciesModule.reportsByMainUtility.get('Self Reference')

                    if (statusReport === undefined) { // This means the status report does not exist, that could happen for instance at the begining of a month.
                        TS.projects.foundations.globals.loggerVariables.VARIABLES_BY_PROCESS_INDEX_MAP.get(processIndex).BOT_MAIN_LOOP_LOGGER_MODULE_OBJECT.write(MODULE_NAME,
                            "[WARN] start -> getContextVariables -> Status Report does not exist. Retrying Later. ");
                        callBackFunction(TS.projects.foundations.globals.standardResponses.DEFAULT_RETRY_RESPONSE);
                        return
                    }

                    if (statusReport.status === "Status Report is corrupt.") {
                        TS.projects.foundations.globals.loggerVariables.VARIABLES_BY_PROCESS_INDEX_MAP.get(processIndex).BOT_MAIN_LOOP_LOGGER_MODULE_OBJECT.write(MODULE_NAME,
                            "[ERROR] start -> getContextVariables -> Can not continue because self dependecy Status Report is corrupt. Aborting Process.");
                        callBackFunction(TS.projects.foundations.globals.standardResponses.DEFAULT_FAIL_RESPONSE);
                        return
                    }

                    thisReport = statusReport.file

                    if (thisReport.lastFile !== undefined) {

                        beginingOfMarket = new Date(thisReport.beginingOfMarket);

                        if (beginingOfMarket.valueOf() !== contextVariables.datetimeBeginingOfMarketFile.valueOf()) { // Reset Mechanism for Begining of the Market

                            beginingOfMarket = new Date(
                                contextVariables.datetimeBeginingOfMarketFile.getUTCFullYear() + "-" +
                                (contextVariables.datetimeBeginingOfMarketFile.getUTCMonth() + 1) + "-" +
                                contextVariables.datetimeBeginingOfMarketFile.getUTCDate() + " " + "00:00" +
                                TS.projects.foundations.globals.timeConstants.GMT_SECONDS);
                            contextVariables.datetimeLastProducedFile = new Date(
                                contextVariables.datetimeBeginingOfMarketFile.getUTCFullYear() + "-" +
                                (contextVariables.datetimeBeginingOfMarketFile.getUTCMonth() + 1) + "-" +
                                contextVariables.datetimeBeginingOfMarketFile.getUTCDate() + " " + "00:00" +
                                TS.projects.foundations.globals.timeConstants.GMT_SECONDS);
                            contextVariables.datetimeLastProducedFile = new Date(
                                contextVariables.datetimeLastProducedFile.valueOf() -
                                TS.projects.foundations.globals.timeConstants.ONE_DAY_IN_MILISECONDS); // Go back one day to start well.

                            buildCandles()
                            return
                        }

                        contextVariables.datetimeLastProducedFile = new Date(thisReport.lastFile);

                        /*
                        Here we assume that the last day written might contain incomplete information. 
                        This actually happens every time the head of the market is reached.
                        For that reason we go back one day, the partial information is discarded and 
                        added again with whatever new info is available.
                        */
                        contextVariables.datetimeLastProducedFile = new Date(contextVariables.datetimeLastProducedFile.valueOf() - TS.projects.foundations.globals.timeConstants.ONE_DAY_IN_MILISECONDS);

                        findPreviousContent()
                        return
                    } else {
                        beginingOfMarket = new Date(
                            contextVariables.datetimeBeginingOfMarketFile.getUTCFullYear() + "-" +
                            (contextVariables.datetimeBeginingOfMarketFile.getUTCMonth() + 1) + "-" +
                            contextVariables.datetimeBeginingOfMarketFile.getUTCDate() + " " + "00:00" +
                            TS.projects.foundations.globals.timeConstants.GMT_SECONDS);
                        contextVariables.datetimeLastProducedFile = new Date(
                            contextVariables.datetimeBeginingOfMarketFile.getUTCFullYear() + "-" +
                            (contextVariables.datetimeBeginingOfMarketFile.getUTCMonth() + 1) + "-" +
                            contextVariables.datetimeBeginingOfMarketFile.getUTCDate() + " " + "00:00" +
                            TS.projects.foundations.globals.timeConstants.GMT_SECONDS);
                        contextVariables.datetimeLastProducedFile = new Date(
                            contextVariables.datetimeLastProducedFile.valueOf() -
                            TS.projects.foundations.globals.timeConstants.ONE_DAY_IN_MILISECONDS); // Go back one day to start well.

                        buildCandles()
                        return
                    }

                } catch (err) {
                    TS.projects.foundations.globals.processVariables.VARIABLES_BY_PROCESS_INDEX_MAP.get(processIndex).UNEXPECTED_ERROR = err
                    TS.projects.foundations.globals.loggerVariables.VARIABLES_BY_PROCESS_INDEX_MAP.get(processIndex).BOT_MAIN_LOOP_LOGGER_MODULE_OBJECT.write(MODULE_NAME,
                        "[ERROR] start -> getContextVariables -> err = " + err.stack);
                    if (err.message === "Cannot read property 'file' of undefined") {
                        TS.projects.foundations.globals.loggerVariables.VARIABLES_BY_PROCESS_INDEX_MAP.get(processIndex).BOT_MAIN_LOOP_LOGGER_MODULE_OBJECT.write(MODULE_NAME,
                            "[HINT] start -> getContextVariables -> Check the bot configuration to see if all of its statusDependenciesModule declarations are correct. ");
                        TS.projects.foundations.globals.loggerVariables.VARIABLES_BY_PROCESS_INDEX_MAP.get(processIndex).BOT_MAIN_LOOP_LOGGER_MODULE_OBJECT.write(MODULE_NAME,
                            "[HINT] start -> getContextVariables -> Dependencies loaded -> keys = " + JSON.stringify(statusDependenciesModule.keys));
                        TS.projects.foundations.globals.loggerVariables.VARIABLES_BY_PROCESS_INDEX_MAP.get(processIndex).BOT_MAIN_LOOP_LOGGER_MODULE_OBJECT.write(MODULE_NAME,
                            "[HINT] start -> getContextVariables -> Dependencies loaded -> Double check that you are not running a process that only can be run at noTime mode at a certain month when it is not prepared to do so.");
                    }
                    callBackFunction(TS.projects.foundations.globals.standardResponses.DEFAULT_FAIL_RESPONSE);
                }
            }

            function findPreviousContent() {
                /*
                This is where we read the current files we have produced at previous runs 
                of this same process. We just read all the content and organize it
                in arrays and keep them in memory.
                */
                try {
                    let n = 0   // loop Variable representing each possible period as defined at the Time Frame Array.

                    let allPreviousCandles = [] // Each item of this array is an array of candles for a certain time frame
                    let allPreviousVolumes = [] // Each item of this array is an array of volumes for a certain time frame

                    loopBody()

                    function loopBody() {
                        let timeFrame = TS.projects.foundations.globals.timeFrames.marketTimeFramesArray()[n][1];
                        TS.projects.foundations.globals.loggerVariables.VARIABLES_BY_PROCESS_INDEX_MAP.get(processIndex).BOT_MAIN_LOOP_LOGGER_MODULE_OBJECT.write(MODULE_NAME,
                            "[INFO] start -> findPreviousContent -> loopBody -> timeFrame = " + timeFrame)

                        let previousCandles
                        let previousVolumes

                        getCandles()

                        function getCandles() {
                            let fileName = 'Data.json';
                            let filePath =
                                TS.projects.foundations.globals.processVariables.VARIABLES_BY_PROCESS_INDEX_MAP.get(processIndex).FILE_PATH_ROOT +
                                "/Output/" +
                                CANDLES_FOLDER_NAME + "/" +
                                TS.projects.foundations.globals.taskConstants.TASK_NODE.bot.processes[processIndex].referenceParent.config.codeName + "/" +
                                timeFrame;
                            filePath += '/' + fileName

                            fileStorage.getTextFile(filePath, onFileReceived);

                            TS.projects.foundations.globals.loggerVariables.VARIABLES_BY_PROCESS_INDEX_MAP.get(processIndex).BOT_MAIN_LOOP_LOGGER_MODULE_OBJECT.write(MODULE_NAME,
                                "[INFO] start -> findPreviousContent -> loopBody -> getCandles -> getting file.");

                            function onFileReceived(err, text) {
                                let candlesFile

                                if (err.result === TS.projects.foundations.globals.standardResponses.DEFAULT_OK_RESPONSE.result) {
                                    try {
                                        candlesFile = JSON.parse(text);
                                        previousCandles = candlesFile;
                                        getVolumes();

                                    } catch (err) {
                                        TS.projects.foundations.globals.loggerVariables.VARIABLES_BY_PROCESS_INDEX_MAP.get(processIndex).BOT_MAIN_LOOP_LOGGER_MODULE_OBJECT.write(MODULE_NAME,
                                            "[ERROR] start -> findPreviousContent -> loopBody -> getCandles -> onFileReceived -> fileName = " + fileName);
                                        TS.projects.foundations.globals.loggerVariables.VARIABLES_BY_PROCESS_INDEX_MAP.get(processIndex).BOT_MAIN_LOOP_LOGGER_MODULE_OBJECT.write(MODULE_NAME,
                                            "[ERROR] start -> findPreviousContent -> loopBody -> getCandles -> onFileReceived -> filePath = " + filePath);
                                        TS.projects.foundations.globals.loggerVariables.VARIABLES_BY_PROCESS_INDEX_MAP.get(processIndex).BOT_MAIN_LOOP_LOGGER_MODULE_OBJECT.write(MODULE_NAME,
                                            "[ERROR] start -> findPreviousContent -> loopBody -> getCandles -> onFileReceived -> err = " + err.stack);
                                        TS.projects.foundations.globals.loggerVariables.VARIABLES_BY_PROCESS_INDEX_MAP.get(processIndex).BOT_MAIN_LOOP_LOGGER_MODULE_OBJECT.write(MODULE_NAME,
                                            "[ERROR] start -> findPreviousContent -> loopBody -> getCandles -> onFileReceived -> Asuming this is a temporary situation. Requesting a Retry.");
                                        callBackFunction(TS.projects.foundations.globals.standardResponses.DEFAULT_RETRY_RESPONSE);
                                    }
                                } else {
                                    TS.projects.foundations.globals.loggerVariables.VARIABLES_BY_PROCESS_INDEX_MAP.get(processIndex).BOT_MAIN_LOOP_LOGGER_MODULE_OBJECT.write(MODULE_NAME,
                                        "[ERROR] start -> findPreviousContent -> loopBody -> getCandles -> onFileReceived -> err = " + err.stack);
                                    callBackFunction(err);
                                }
                            }
                        }

                        function getVolumes() {
                            let fileName = 'Data.json';
                            let filePath =
                                TS.projects.foundations.globals.processVariables.VARIABLES_BY_PROCESS_INDEX_MAP.get(processIndex).FILE_PATH_ROOT +
                                "/Output/" +
                                VOLUMES_FOLDER_NAME + "/" +
                                TS.projects.foundations.globals.taskConstants.TASK_NODE.bot.processes[processIndex].referenceParent.config.codeName + "/" +
                                timeFrame;
                            filePath += '/' + fileName

                            fileStorage.getTextFile(filePath, onFileReceived);

                            TS.projects.foundations.globals.loggerVariables.VARIABLES_BY_PROCESS_INDEX_MAP.get(processIndex).BOT_MAIN_LOOP_LOGGER_MODULE_OBJECT.write(MODULE_NAME,
                                "[INFO] start -> findPreviousContent -> loopBody -> getVolumes -> getting file.");

                            function onFileReceived(err, text) {
                                let volumesFile

                                if (err.result === TS.projects.foundations.globals.standardResponses.DEFAULT_OK_RESPONSE.result) {
                                    try {
                                        volumesFile = JSON.parse(text);
                                        previousVolumes = volumesFile;
                                        allPreviousCandles.push(previousCandles);
                                        allPreviousVolumes.push(previousVolumes);

                                        controlLoop();

                                    } catch (err) {
                                        TS.projects.foundations.globals.loggerVariables.VARIABLES_BY_PROCESS_INDEX_MAP.get(processIndex).BOT_MAIN_LOOP_LOGGER_MODULE_OBJECT.write(MODULE_NAME,
                                            "[ERROR] start -> findPreviousContent -> loopBody -> getVolumes -> onFileReceived -> fileName = " + fileName);
                                        TS.projects.foundations.globals.loggerVariables.VARIABLES_BY_PROCESS_INDEX_MAP.get(processIndex).BOT_MAIN_LOOP_LOGGER_MODULE_OBJECT.write(MODULE_NAME,
                                            "[ERROR] start -> findPreviousContent -> loopBody -> getVolumes -> onFileReceived -> filePath = " + filePath);
                                        TS.projects.foundations.globals.loggerVariables.VARIABLES_BY_PROCESS_INDEX_MAP.get(processIndex).BOT_MAIN_LOOP_LOGGER_MODULE_OBJECT.write(MODULE_NAME,
                                            "[ERROR] start -> findPreviousContent -> loopBody -> getVolumes -> onFileReceived -> err = " + err.stack);
                                        TS.projects.foundations.globals.loggerVariables.VARIABLES_BY_PROCESS_INDEX_MAP.get(processIndex).BOT_MAIN_LOOP_LOGGER_MODULE_OBJECT.write(MODULE_NAME,
                                            "[ERROR] start -> findPreviousContent -> loopBody -> getVolumes -> onFileReceived -> Asuming this is a temporary situation. Requesting a Retry.");
                                        callBackFunction(TS.projects.foundations.globals.standardResponses.DEFAULT_RETRY_RESPONSE);
                                    }
                                } else {
                                    TS.projects.foundations.globals.loggerVariables.VARIABLES_BY_PROCESS_INDEX_MAP.get(processIndex).BOT_MAIN_LOOP_LOGGER_MODULE_OBJECT.write(MODULE_NAME,
                                        "[ERROR] start -> findPreviousContent -> loopBody -> getVolumes -> onFileReceived -> err = " + err.stack);
                                    callBackFunction(err);
                                }
                            }
                        }

                    }

                    function controlLoop() {
                        n++
                        if (n < TS.projects.foundations.globals.timeFrames.marketTimeFramesArray().length) {
                            loopBody()
                        } else {
                            buildCandles(allPreviousCandles, allPreviousVolumes);
                        }
                    }
                }
                catch (err) {
                    TS.projects.foundations.globals.processVariables.VARIABLES_BY_PROCESS_INDEX_MAP.get(processIndex).UNEXPECTED_ERROR = err
                    TS.projects.foundations.globals.loggerVariables.VARIABLES_BY_PROCESS_INDEX_MAP.get(processIndex).BOT_MAIN_LOOP_LOGGER_MODULE_OBJECT.write(MODULE_NAME,
                        "[ERROR] start -> findPreviousContent -> err = " + err.stack);
                    callBackFunction(TS.projects.foundations.globals.standardResponses.DEFAULT_FAIL_RESPONSE);
                }
            }

            function buildCandles(allPreviousCandles, allPreviousVolumes) {

                try {
                    let fromDate = new Date(contextVariables.datetimeLastProducedFile.valueOf())
                    let lastDate = TS.projects.foundations.utilities.dateTimeFunctions.removeTime(new Date())
                    /*
                    Firstly we prepere the arrays that will accumulate all the information for each output file.
                    */
                    let outputCandles = [];
                    let outputVolumes = [];

                    for (let n = 0; n < TS.projects.foundations.globals.timeFrames.marketTimeFramesArray().length; n++) {
                        const emptyArray1 = [];
                        const emptyArray2 = [];
                        outputCandles.push(emptyArray1);
                        outputVolumes.push(emptyArray2);
                    }

                    advanceTime()

                    function advanceTime() {
                        /*
                        We position ourselves on the latest date that was added to the market files
                        since we are going to re-process that date, removing first the elements of that 
                        date and then adding again all the elements found right now at that date and then
                        from there into the future.
                        */
                        contextVariables.datetimeLastProducedFile = new Date(contextVariables.datetimeLastProducedFile.valueOf() + TS.projects.foundations.globals.timeConstants.ONE_DAY_IN_MILISECONDS);

                        TS.projects.foundations.globals.loggerVariables.VARIABLES_BY_PROCESS_INDEX_MAP.get(processIndex).BOT_MAIN_LOOP_LOGGER_MODULE_OBJECT.write(MODULE_NAME,
                            "[INFO] start -> buildCandles -> advanceTime -> New processing time @ " + contextVariables.datetimeLastProducedFile.getUTCFullYear() + "/" + (contextVariables.datetimeLastProducedFile.getUTCMonth() + 1) + "/" + contextVariables.datetimeLastProducedFile.getUTCDate() + ".")

                        /* Validation that we are not going past the head of the market. */
                        if (contextVariables.datetimeLastProducedFile.valueOf() > contextVariables.datetimeLastAvailableDependencyFile.valueOf()) {

                            TS.projects.foundations.globals.loggerVariables.VARIABLES_BY_PROCESS_INDEX_MAP.get(processIndex).BOT_MAIN_LOOP_LOGGER_MODULE_OBJECT.write(MODULE_NAME,
                                "[INFO] start -> buildCandles -> advanceTime -> Head of the market found @ " + contextVariables.datetimeLastProducedFile.getUTCFullYear() + "/" + (contextVariables.datetimeLastProducedFile.getUTCMonth() + 1) + "/" + contextVariables.datetimeLastProducedFile.getUTCDate() + ".")

                            callBackFunction(TS.projects.foundations.globals.standardResponses.DEFAULT_OK_RESPONSE); // Here is where we finish processing and wait for the platform to run this module again.
                            return
                        }

                        /*  Telling the world we are alive and doing well */
                        let currentDateString =
                            contextVariables.datetimeLastProducedFile.getUTCFullYear() + '-' +
                            TS.projects.foundations.utilities.miscellaneousFunctions.pad(contextVariables.datetimeLastProducedFile.getUTCMonth() + 1, 2) + '-' +
                            TS.projects.foundations.utilities.miscellaneousFunctions.pad(contextVariables.datetimeLastProducedFile.getUTCDate(), 2);
                        let currentDate = new Date(contextVariables.datetimeLastProducedFile)
                        let percentage = TS.projects.foundations.utilities.dateTimeFunctions.getPercentage(fromDate, currentDate, lastDate)
                        TS.projects.foundations.functionLibraries.processFunctions.processHeartBeat(processIndex, currentDateString, percentage)

                        if (TS.projects.foundations.utilities.dateTimeFunctions.areTheseDatesEqual(currentDate, new Date()) === false) {
                            TS.projects.foundations.globals.loggerVariables.VARIABLES_BY_PROCESS_INDEX_MAP.get(processIndex).BOT_MAIN_LOOP_LOGGER_MODULE_OBJECT.newInternalLoop(currentDate, percentage);
                        }
                        timeframesLoop()
                    }

                    function timeframesLoop() {
                        /*
                        We will iterate through all posible time frames.
                        */
                        let n = 0   // loop Variable representing each possible period as defined at the Time Frame Array.

                        loopBody()

                        function loopBody() {
                            let previousCandles // This is an array with all the elements already existing for a certain time frame.
                            let previousVolumes

                            if (allPreviousCandles !== undefined) {
                                previousCandles = allPreviousCandles[n];
                                previousVolumes = allPreviousVolumes[n];
                            }

                            const outputPeriod = TS.projects.foundations.globals.timeFrames.marketTimeFramesArray()[n][0];
                            const timeFrame = TS.projects.foundations.globals.timeFrames.marketTimeFramesArray()[n][1];
                            /*
                            Here we are inside a Loop that is going to advance 1 day at the time, 
                            at each pass, we will read one of Exchange Raw Data's daily files and
                            add all its candles to our in memory arrays. 
                            
                            At the first iteration of this loop, we will add the candles that we are carrying
                            from our previous run, the ones we already have in-memory. 

                            You can see below how we discard the elements that
                            belong to the first day we are processing at this run, 
                            that it is exactly the same as the last day processed the previous
                            run. By discarding these candles, we are ready to run after that standard 
                            function that will just add ALL the candles found each day at Exchange Raw Data.
                            */
                            if (previousCandles !== undefined && previousCandles.length !== 0) {
                                for (let i = 0; i < previousCandles.length; i++) {
                                    let candle = {
                                        open: previousCandles[i][2],
                                        close: previousCandles[i][3],
                                        min: previousCandles[i][0],
                                        max: previousCandles[i][1],
                                        begin: previousCandles[i][4],
                                        end: previousCandles[i][5]
                                    }

                                    if (candle.end < contextVariables.datetimeLastProducedFile.valueOf()) {
                                        outputCandles[n].push(candle);
                                    } else {
                                        TS.projects.foundations.globals.loggerVariables.VARIABLES_BY_PROCESS_INDEX_MAP.get(processIndex).BOT_MAIN_LOOP_LOGGER_MODULE_OBJECT.write(MODULE_NAME,
                                            "[INFO] start -> buildCandles -> timeframesLoop -> loopBody -> Candle # " + i + " @ " + timeFrame + " discarded for closing past the current process time.")
                                    }
                                }
                                allPreviousCandles[n] = [] // erasing these so as not to duplicate them.
                            }

                            if (previousVolumes !== undefined && previousVolumes.length !== 0) {

                                for (let i = 0; i < previousVolumes.length; i++) {
                                    let volume = {
                                        begin: previousVolumes[i][2],
                                        end: previousVolumes[i][3],
                                        buy: previousVolumes[i][0],
                                        sell: previousVolumes[i][1]
                                    }

                                    if (volume.end < contextVariables.datetimeLastProducedFile.valueOf()) {

                                        outputVolumes[n].push(volume);

                                    } else {
                                        TS.projects.foundations.globals.loggerVariables.VARIABLES_BY_PROCESS_INDEX_MAP.get(processIndex).BOT_MAIN_LOOP_LOGGER_MODULE_OBJECT.write(MODULE_NAME,
                                            "[INFO] start -> buildCandles -> timeframesLoop -> loopBody -> Volume # " + i + " @ " + timeFrame + " discarded for closing past the current process time.")
                                    }
                                }
                                allPreviousVolumes[n] = []; // erasing these so as not to duplicate them.
                            }
                            /*
                            From here on is where every iteration of the loop fully runs. Here is where we 
                            read Exchange Raw Data's files and add their content to whatever
                            we already have in our arrays in-memory. In this way the process will run as 
                            many days needed and it should only stop when it reaches
                            the head of the market.
                            */
                            nextCandleFile();

                            function nextCandleFile() {
                                let dateForPath = contextVariables.datetimeLastProducedFile.getUTCFullYear() + '/' + TS.projects.foundations.utilities.miscellaneousFunctions.pad(contextVariables.datetimeLastProducedFile.getUTCMonth() + 1, 2) + '/' + TS.projects.foundations.utilities.miscellaneousFunctions.pad(contextVariables.datetimeLastProducedFile.getUTCDate(), 2);
                                let fileName = "Data.json"

                                let filePathRoot =
                                    'Project/' +
                                    TS.projects.foundations.globals.taskConstants.PROJECT_DEFINITION_NODE.config.codeName + "/" +
                                    TS.projects.foundations.globals.taskConstants.TASK_NODE.bot.processes[processIndex].referenceParent.parentNode.parentNode.type.replace(' ', '-') + "/" +
                                    TS.projects.foundations.globals.taskConstants.TASK_NODE.bot.processes[processIndex].referenceParent.parentNode.parentNode.config.codeName + "/" +
                                    "Exchange-Raw-Data" + '/' + TS.projects.foundations.globals.taskConstants.TASK_NODE.parentNode.parentNode.parentNode.referenceParent.parentNode.parentNode.config.codeName + "/" +
                                    TS.projects.foundations.globals.taskConstants.TASK_NODE.parentNode.parentNode.parentNode.referenceParent.baseAsset.referenceParent.config.codeName + "-" +
                                    TS.projects.foundations.globals.taskConstants.TASK_NODE.parentNode.parentNode.parentNode.referenceParent.quotedAsset.referenceParent.config.codeName
                                let filePath = filePathRoot + "/Output/" + CANDLES_FOLDER_NAME + '/' + CANDLES_ONE_MIN + '/' + dateForPath;
                                filePath += '/' + fileName

                                fileStorage.getTextFile(filePath, onFileReceived);

                                TS.projects.foundations.globals.loggerVariables.VARIABLES_BY_PROCESS_INDEX_MAP.get(processIndex).BOT_MAIN_LOOP_LOGGER_MODULE_OBJECT.write(MODULE_NAME,
                                    "[INFO] start -> buildCandles -> timeframesLoop -> loopBody -> nextCandleFile -> getting file at dateForPath = " + dateForPath);

                                function onFileReceived(err, text) {
                                    try {
                                        let candlesFile

                                        if (err.result === TS.projects.foundations.globals.standardResponses.DEFAULT_OK_RESPONSE.result) {
                                            try {
                                                candlesFile = JSON.parse(text);
                                            } catch (err) {
                                                TS.projects.foundations.globals.loggerVariables.VARIABLES_BY_PROCESS_INDEX_MAP.get(processIndex).BOT_MAIN_LOOP_LOGGER_MODULE_OBJECT.write(MODULE_NAME,
                                                    "[ERROR] start -> buildCandles -> timeframesLoop -> loopBody -> nextCandleFile -> onFileReceived -> Error Parsing JSON -> err = " + err.stack);
                                                TS.projects.foundations.globals.loggerVariables.VARIABLES_BY_PROCESS_INDEX_MAP.get(processIndex).BOT_MAIN_LOOP_LOGGER_MODULE_OBJECT.write(MODULE_NAME,
                                                    "[ERROR] start -> buildCandles -> timeframesLoop -> loopBody -> nextCandleFile -> onFileReceived -> Asuming this is a temporary situation. Requesting a Retry.");
                                                callBackFunction(TS.projects.foundations.globals.standardResponses.DEFAULT_RETRY_RESPONSE);
                                                return
                                            }
                                        } else {

                                            if (err.message === 'File does not exist.' || err.code === 'The specified key does not exist.') {

                                                TS.projects.foundations.globals.loggerVariables.VARIABLES_BY_PROCESS_INDEX_MAP.get(processIndex).BOT_MAIN_LOOP_LOGGER_MODULE_OBJECT.write(MODULE_NAME,
                                                    "[WARN] start -> buildCandles -> timeframesLoop -> loopBody -> nextCandleFile -> onFileReceived -> Dependency Not Ready -> err = " + JSON.stringify(err));
                                                TS.projects.foundations.globals.loggerVariables.VARIABLES_BY_PROCESS_INDEX_MAP.get(processIndex).BOT_MAIN_LOOP_LOGGER_MODULE_OBJECT.write(MODULE_NAME,
                                                    "[WARN] start -> buildCandles -> timeframesLoop -> loopBody -> nextCandleFile -> onFileReceived -> Asuming this is a temporary situation. Requesting a Retry.");
                                                callBackFunction(TS.projects.foundations.globals.standardResponses.DEFAULT_RETRY_RESPONSE);
                                                return

                                            } else {
                                                TS.projects.foundations.globals.loggerVariables.VARIABLES_BY_PROCESS_INDEX_MAP.get(processIndex).BOT_MAIN_LOOP_LOGGER_MODULE_OBJECT.write(MODULE_NAME,
                                                    "[ERROR] start -> buildCandles -> timeframesLoop -> loopBody -> nextCandleFile -> onFileReceived -> Error Received -> err = " + err.stack);
                                                callBackFunction(err)
                                                return
                                            }
                                        }

                                        const inputCandlesPerdiod = 60 * 1000;              // 1 min
                                        const inputFilePeriod = 24 * 60 * 60 * 1000;        // 24 hs
                                        let totalOutputCandles = inputFilePeriod / outputPeriod; // this should be 2 in this case.
                                        let beginingOutputTime = contextVariables.datetimeLastProducedFile.valueOf();
                                        /*
                                        The algorithm that follows is going to agregate candles of 1 min timeFrame read from Exchange Raw Data, into candles of each timeFrame
                                        that Candles Volumes generates. For market files those timePediods goes from 1h to 24hs.
                                        */
                                        for (let i = 0; i < totalOutputCandles; i++) {

                                            let outputCandle = {
                                                open: 0,
                                                close: 0,
                                                min: 0,
                                                max: 0,
                                                begin: 0,
                                                end: 0
                                            };

                                            let saveCandle = false;
                                            outputCandle.begin = beginingOutputTime + i * outputPeriod;
                                            outputCandle.end = beginingOutputTime + (i + 1) * outputPeriod - 1;

                                            for (let j = 0; j < candlesFile.length; j++) {
                                                let candle = {
                                                    open: candlesFile[j][2],
                                                    close: candlesFile[j][3],
                                                    min: candlesFile[j][0],
                                                    max: candlesFile[j][1],
                                                    begin: candlesFile[j][4],
                                                    end: candlesFile[j][5]
                                                }
                                                /* Here we discard all the candles out of range.  */
                                                if (candle.begin >= outputCandle.begin && candle.end <= outputCandle.end) {

                                                    if (saveCandle === false) { // this will set the value only once.
                                                        outputCandle.open = candle.open;
                                                        outputCandle.min = candle.min;
                                                        outputCandle.max = candle.max;
                                                    }

                                                    saveCandle = true;
                                                    outputCandle.close = candle.close;      // only the last one will be saved
                                                    if (candle.min < outputCandle.min) {
                                                        outputCandle.min = candle.min;
                                                    }
                                                    if (candle.max > outputCandle.max) {
                                                        outputCandle.max = candle.max;
                                                    }
                                                }
                                            }
                                            if (saveCandle === true) {      // then we have a valid candle, otherwise it means there were no candles to fill this one in its time range.
                                                outputCandles[n].push(outputCandle);
                                            }
                                        }
                                        nextVolumeFile();

                                    } catch (err) {
                                        TS.projects.foundations.globals.processVariables.VARIABLES_BY_PROCESS_INDEX_MAP.get(processIndex).UNEXPECTED_ERROR = err
                                        TS.projects.foundations.globals.loggerVariables.VARIABLES_BY_PROCESS_INDEX_MAP.get(processIndex).BOT_MAIN_LOOP_LOGGER_MODULE_OBJECT.write(MODULE_NAME,
                                            "[ERROR] start -> buildCandles -> timeframesLoop -> loopBody -> nextCandleFile -> onFileReceived -> err = " + err.stack);
                                        callBackFunction(TS.projects.foundations.globals.standardResponses.DEFAULT_FAIL_RESPONSE);
                                    }
                                }
                            }

                            function nextVolumeFile() {
                                try {
                                    TS.projects.foundations.globals.loggerVariables.VARIABLES_BY_PROCESS_INDEX_MAP.get(processIndex).BOT_MAIN_LOOP_LOGGER_MODULE_OBJECT.write(MODULE_NAME,
                                        "[INFO] start -> buildCandles -> timeframesLoop -> loopBody -> nextVolumeFile -> Entering function.")

                                    let dateForPath =
                                        contextVariables.datetimeLastProducedFile.getUTCFullYear() + '/' +
                                        TS.projects.foundations.utilities.miscellaneousFunctions.pad(contextVariables.datetimeLastProducedFile.getUTCMonth() + 1, 2) + '/' +
                                        TS.projects.foundations.utilities.miscellaneousFunctions.pad(contextVariables.datetimeLastProducedFile.getUTCDate(), 2);
                                    let fileName = "Data.json"

                                    let filePathRoot =
                                        'Project/' +
                                        TS.projects.foundations.globals.taskConstants.PROJECT_DEFINITION_NODE.config.codeName + "/" +
                                        TS.projects.foundations.globals.taskConstants.TASK_NODE.bot.processes[processIndex].referenceParent.parentNode.parentNode.type.replace(' ', '-') + "/" +
                                        TS.projects.foundations.globals.taskConstants.TASK_NODE.bot.processes[processIndex].referenceParent.parentNode.parentNode.config.codeName + "/" +
                                        "Exchange-Raw-Data" + '/' + TS.projects.foundations.globals.taskConstants.TASK_NODE.parentNode.parentNode.parentNode.referenceParent.parentNode.parentNode.config.codeName + "/" +
                                        TS.projects.foundations.globals.taskConstants.TASK_NODE.parentNode.parentNode.parentNode.referenceParent.baseAsset.referenceParent.config.codeName + "-" +
                                        TS.projects.foundations.globals.taskConstants.TASK_NODE.parentNode.parentNode.parentNode.referenceParent.quotedAsset.referenceParent.config.codeName
                                    let filePath = filePathRoot + "/Output/" + VOLUMES_FOLDER_NAME + '/' + VOLUMES_ONE_MIN + '/' + dateForPath;
                                    filePath += '/' + fileName
                                    fileStorage.getTextFile(filePath, onFileReceived);

                                    TS.projects.foundations.globals.loggerVariables.VARIABLES_BY_PROCESS_INDEX_MAP.get(processIndex).BOT_MAIN_LOOP_LOGGER_MODULE_OBJECT.write(MODULE_NAME,
                                        "[INFO] start -> buildCandles -> timeframesLoop -> loopBody -> nextVolumeFile -> getting file at dateForPath = " + dateForPath);

                                    function onFileReceived(err, text) {
                                        TS.projects.foundations.globals.loggerVariables.VARIABLES_BY_PROCESS_INDEX_MAP.get(processIndex).BOT_MAIN_LOOP_LOGGER_MODULE_OBJECT.write(MODULE_NAME,
                                            "[INFO] start -> buildCandles -> timeframesLoop -> loopBody -> nextVolumeFile -> onFileReceived -> Entering function.")

                                        let volumesFile
                                        if (err.result === TS.projects.foundations.globals.standardResponses.DEFAULT_OK_RESPONSE.result) {
                                            try {
                                                volumesFile = JSON.parse(text);

                                            } catch (err) {
                                                TS.projects.foundations.globals.loggerVariables.VARIABLES_BY_PROCESS_INDEX_MAP.get(processIndex).BOT_MAIN_LOOP_LOGGER_MODULE_OBJECT.write(MODULE_NAME,
                                                    "[ERROR] start -> buildCandles -> timeframesLoop -> loopBody -> nextVolumeFile -> onFileReceived -> Error Parsing JSON -> err = " + err.stack);
                                                TS.projects.foundations.globals.loggerVariables.VARIABLES_BY_PROCESS_INDEX_MAP.get(processIndex).BOT_MAIN_LOOP_LOGGER_MODULE_OBJECT.write(MODULE_NAME,
                                                    "[ERROR] start -> buildCandles -> timeframesLoop -> loopBody -> nextVolumeFile -> onFileReceived -> Asuming this is a temporary situation. Requesting a Retry.");
                                                callBackFunction(TS.projects.foundations.globals.standardResponses.DEFAULT_RETRY_RESPONSE);
                                                return;
                                            }
                                        } else {
                                            TS.projects.foundations.globals.loggerVariables.VARIABLES_BY_PROCESS_INDEX_MAP.get(processIndex).BOT_MAIN_LOOP_LOGGER_MODULE_OBJECT.write(MODULE_NAME,
                                                "[ERROR] start -> buildCandles -> timeframesLoop -> loopBody -> nextVolumeFile -> onFileReceived -> Error Received -> err = " + err.stack);
                                            callBackFunction(err);
                                            return;
                                        }
                                        const inputVolumesPerdiod = 60 * 1000;              // 1 min
                                        const inputFilePeriod = 24 * 60 * 60 * 1000;        // 24 hs

                                        let totalOutputVolumes = inputFilePeriod / outputPeriod; // this should be 2 in this case.
                                        let beginingOutputTime = contextVariables.datetimeLastProducedFile.valueOf();

                                        for (let i = 0; i < totalOutputVolumes; i++) {
                                            let outputVolume = {
                                                buy: 0,
                                                sell: 0,
                                                begin: 0,
                                                end: 0
                                            }

                                            let saveVolume = false;
                                            outputVolume.begin = beginingOutputTime + i * outputPeriod;
                                            outputVolume.end = beginingOutputTime + (i + 1) * outputPeriod - 1;

                                            for (let j = 0; j < volumesFile.length; j++) {
                                                let volume = {
                                                    buy: volumesFile[j][0],
                                                    sell: volumesFile[j][1],
                                                    begin: volumesFile[j][2],
                                                    end: volumesFile[j][3]
                                                }

                                                /* Here we discard all the Volumes out of range.  */
                                                if (volume.begin >= outputVolume.begin && volume.end <= outputVolume.end) {

                                                    saveVolume = true;

                                                    outputVolume.buy = outputVolume.buy + volume.buy;
                                                    outputVolume.sell = outputVolume.sell + volume.sell;
                                                }
                                            }

                                            if (saveVolume === true) {
                                                outputVolumes[n].push(outputVolume);
                                            }
                                        }

                                        writeFiles(outputCandles[n], outputVolumes[n], timeFrame, controlLoop);
                                    }
                                } catch (err) {
                                    TS.projects.foundations.globals.processVariables.VARIABLES_BY_PROCESS_INDEX_MAP.get(processIndex).UNEXPECTED_ERROR = err
                                    TS.projects.foundations.globals.loggerVariables.VARIABLES_BY_PROCESS_INDEX_MAP.get(processIndex).BOT_MAIN_LOOP_LOGGER_MODULE_OBJECT.write(MODULE_NAME,
                                        "[ERROR] start -> buildCandles -> timeframesLoop -> loopBody -> nextVolumeFile -> onFileReceived -> err = " + err.stack);
                                    callBackFunction(TS.projects.foundations.globals.standardResponses.DEFAULT_FAIL_RESPONSE);
                                }
                            }
                        }

                        function controlLoop() {

                            TS.projects.foundations.globals.loggerVariables.VARIABLES_BY_PROCESS_INDEX_MAP.get(processIndex).BOT_MAIN_LOOP_LOGGER_MODULE_OBJECT.write(MODULE_NAME,
                                "[INFO] start -> buildCandles -> timeframesLoop -> controlLoop -> Entering function.")
                            n++
                            if (n < TS.projects.foundations.globals.timeFrames.marketTimeFramesArray().length) {
                                loopBody()
                            } else {
                                writeStatusReport(contextVariables.datetimeLastProducedFile, advanceTime);
                            }
                        }
                    }
                }
                catch (err) {
                    TS.projects.foundations.globals.loggerVariables.VARIABLES_BY_PROCESS_INDEX_MAP.get(processIndex).BOT_MAIN_LOOP_LOGGER_MODULE_OBJECT.write(MODULE_NAME,
                        "[ERROR] start -> buildCandles -> err = " + err.stack);
                    callBackFunction(TS.projects.foundations.globals.standardResponses.DEFAULT_FAIL_RESPONSE);
                }
            }

            function writeFiles(candles, volumes, timeFrame, callBack) {

                TS.projects.foundations.globals.loggerVariables.VARIABLES_BY_PROCESS_INDEX_MAP.get(processIndex).BOT_MAIN_LOOP_LOGGER_MODULE_OBJECT.write(MODULE_NAME,
                    "[INFO] start -> writeFiles -> Entering function.")
                /*
                Here we will write the contents of the Candles and Volumens files.
                */
                try {
                    writeCandles()

                    function writeCandles() {

                        TS.projects.foundations.globals.loggerVariables.VARIABLES_BY_PROCESS_INDEX_MAP.get(processIndex).BOT_MAIN_LOOP_LOGGER_MODULE_OBJECT.write(MODULE_NAME,
                            "[INFO] start -> writeFiles -> writeCandles -> Entering function.")

                        let separator = ""
                        let fileRecordCounter = 0
                        let fileContent = ""

                        for (let i = 0; i < candles.length; i++) {
                            let candle = candles[i];
                            fileContent = fileContent + separator + '[' + candles[i].min + "," + candles[i].max + "," + candles[i].open + "," + candles[i].close + "," + candles[i].begin + "," + candles[i].end + "]";
                            if (separator === "") { separator = ","; }
                            fileRecordCounter++
                        }

                        fileContent = "[" + fileContent + "]";

                        let fileName = 'Data.json';
                        let filePath = TS.projects.foundations.globals.processVariables.VARIABLES_BY_PROCESS_INDEX_MAP.get(processIndex).FILE_PATH_ROOT +
                            "/Output/" +
                            CANDLES_FOLDER_NAME + "/" +
                            TS.projects.foundations.globals.taskConstants.TASK_NODE.bot.processes[processIndex].referenceParent.config.codeName + "/" +
                            timeFrame
                        filePath += '/' + fileName

                        fileStorage.createTextFile(filePath, fileContent + '\n', onFileCreated);

                        TS.projects.foundations.globals.loggerVariables.VARIABLES_BY_PROCESS_INDEX_MAP.get(processIndex).BOT_MAIN_LOOP_LOGGER_MODULE_OBJECT.write(MODULE_NAME,
                            "[INFO] start -> writeFiles -> writeCandles -> creating file at filePath = " + filePath);

                        function onFileCreated(err) {
                            TS.projects.foundations.globals.loggerVariables.VARIABLES_BY_PROCESS_INDEX_MAP.get(processIndex).BOT_MAIN_LOOP_LOGGER_MODULE_OBJECT.write(MODULE_NAME,
                                "[INFO] start -> writeFiles -> writeCandles -> onFileCreated -> Entering function.")

                            if (err.result !== TS.projects.foundations.globals.standardResponses.DEFAULT_OK_RESPONSE.result) {
                                TS.projects.foundations.globals.loggerVariables.VARIABLES_BY_PROCESS_INDEX_MAP.get(processIndex).BOT_MAIN_LOOP_LOGGER_MODULE_OBJECT.write(MODULE_NAME,
                                    "[ERROR] start -> writeFiles -> writeCandles -> onFileCreated -> err = " + err.stack)
                                callBackFunction(err)
                                return
                            }

                            TS.projects.foundations.globals.loggerVariables.VARIABLES_BY_PROCESS_INDEX_MAP.get(processIndex).BOT_MAIN_LOOP_LOGGER_MODULE_OBJECT.write(MODULE_NAME,
                                "[WARN] start -> writeFiles -> writeCandles -> onFileCreated ->  Finished with File @ " + TS.projects.foundations.globals.taskConstants.TASK_NODE.parentNode.parentNode.parentNode.referenceParent.baseAsset.referenceParent.config.codeName + "_" + TS.projects.foundations.globals.taskConstants.TASK_NODE.parentNode.parentNode.parentNode.referenceParent.quotedAsset.referenceParent.config.codeName + ", " + fileRecordCounter + " records inserted into " + filePath + "/" + fileName)
                            writeVolumes()
                        }
                    }

                    function writeVolumes() {
                        let separator = "";
                        let fileRecordCounter = 0;
                        let fileContent = "";

                        for (let i = 0; i < volumes.length; i++) {
                            let candle = volumes[i];
                            fileContent = fileContent + separator + '[' + volumes[i].buy + "," + volumes[i].sell + "," + volumes[i].begin + "," + volumes[i].end + "]";
                            if (separator === "") { separator = ","; }
                            fileRecordCounter++
                        }

                        fileContent = "[" + fileContent + "]";

                        let fileName = 'Data.json';
                        let filePath = TS.projects.foundations.globals.processVariables.VARIABLES_BY_PROCESS_INDEX_MAP.get(processIndex).FILE_PATH_ROOT + "/Output/" + VOLUMES_FOLDER_NAME + "/" + TS.projects.foundations.globals.taskConstants.TASK_NODE.bot.processes[processIndex].referenceParent.config.codeName + "/" + timeFrame;
                        filePath += '/' + fileName

                        fileStorage.createTextFile(filePath, fileContent + '\n', onFileCreated);

                        TS.projects.foundations.globals.loggerVariables.VARIABLES_BY_PROCESS_INDEX_MAP.get(processIndex).BOT_MAIN_LOOP_LOGGER_MODULE_OBJECT.write(MODULE_NAME,
                            "[INFO] start -> writeFiles -> writeVolumes -> creating file at filePath = " + filePath);

                        function onFileCreated(err) {
                            if (err.result !== TS.projects.foundations.globals.standardResponses.DEFAULT_OK_RESPONSE.result) {
                                TS.projects.foundations.globals.loggerVariables.VARIABLES_BY_PROCESS_INDEX_MAP.get(processIndex).BOT_MAIN_LOOP_LOGGER_MODULE_OBJECT.write(MODULE_NAME,
                                    "[ERROR] start -> writeFiles -> writeVolumes -> onFileCreated -> err = " + err.stack);
                                callBackFunction(err);
                                return;
                            }

                            TS.projects.foundations.globals.loggerVariables.VARIABLES_BY_PROCESS_INDEX_MAP.get(processIndex).BOT_MAIN_LOOP_LOGGER_MODULE_OBJECT.write(MODULE_NAME,
                                "[WARN] start -> writeFiles -> writeVolumes -> onFileCreated ->  Finished with File @ " + TS.projects.foundations.globals.taskConstants.TASK_NODE.parentNode.parentNode.parentNode.referenceParent.baseAsset.referenceParent.config.codeName + "_" + TS.projects.foundations.globals.taskConstants.TASK_NODE.parentNode.parentNode.parentNode.referenceParent.quotedAsset.referenceParent.config.codeName + ", " + fileRecordCounter + " records inserted into " + filePath + "/" + fileName);

                            callBack()
                        }
                    }
                }
                catch (err) {
                    TS.projects.foundations.globals.processVariables.VARIABLES_BY_PROCESS_INDEX_MAP.get(processIndex).UNEXPECTED_ERROR = err
                    TS.projects.foundations.globals.loggerVariables.VARIABLES_BY_PROCESS_INDEX_MAP.get(processIndex).BOT_MAIN_LOOP_LOGGER_MODULE_OBJECT.write(MODULE_NAME,
                        "[ERROR] start -> writeFiles -> err = " + err.stack);
                    callBackFunction(TS.projects.foundations.globals.standardResponses.DEFAULT_FAIL_RESPONSE);
                }
            }

            function writeStatusReport(lastFileDate, callBack) {
                TS.projects.foundations.globals.loggerVariables.VARIABLES_BY_PROCESS_INDEX_MAP.get(processIndex).BOT_MAIN_LOOP_LOGGER_MODULE_OBJECT.write(MODULE_NAME,
                    "[INFO] start -> writeStatusReport -> lastFileDate = " + lastFileDate)

                try {
                    let thisReport = statusDependenciesModule.reportsByMainUtility.get('Self Reference')

                    thisReport.file.lastExecution = TS.projects.foundations.globals.processVariables.VARIABLES_BY_PROCESS_INDEX_MAP.get(processIndex).PROCESS_DATETIME
                    thisReport.file.lastFile = lastFileDate
                    thisReport.file.beginingOfMarket = beginingOfMarket.toUTCString()
                    thisReport.save(callBack)
                }
                catch (err) {
                    TS.projects.foundations.globals.processVariables.VARIABLES_BY_PROCESS_INDEX_MAP.get(processIndex).UNEXPECTED_ERROR = err
                    TS.projects.foundations.globals.loggerVariables.VARIABLES_BY_PROCESS_INDEX_MAP.get(processIndex).BOT_MAIN_LOOP_LOGGER_MODULE_OBJECT.write(MODULE_NAME,
                        "[ERROR] start -> writeStatusReport -> err = " + err.stack);
                    callBackFunction(TS.projects.foundations.globals.standardResponses.DEFAULT_FAIL_RESPONSE)
                }
            }
        }
        catch (err) {
            TS.projects.foundations.globals.processVariables.VARIABLES_BY_PROCESS_INDEX_MAP.get(processIndex).UNEXPECTED_ERROR = err
            TS.projects.foundations.globals.loggerVariables.VARIABLES_BY_PROCESS_INDEX_MAP.get(processIndex).BOT_MAIN_LOOP_LOGGER_MODULE_OBJECT.write(MODULE_NAME,
                "[ERROR] start -> err = " + err.stack);
            callBackFunction(TS.projects.foundations.globals.standardResponses.DEFAULT_FAIL_RESPONSE)
        }
    }
}
