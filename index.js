var fs=require('fs');
var moment =require("moment")
var pc = require("pace-converter");
var alasql = require("alasql");
var parser = require('xml2json');
var isNumeric = require('isnumeric');
var _=require('underscore');
var alasql = require("alasql");
var xmlParser = require('xml2json');
var tcx=require('tcx-js');



module.exports ={
    getRunStats: function(fullPath, path, wucdtime, maxhr){

        var runObj = this.getRunFromFile(fullPath);
        var allSegments = runObj.trackpoints;
        if (allSegments.length>0){
            var obj = this.getSummary(allSegments,wucdtime,maxhr)
            obj.totalKm = runObj.totalKm;
            obj.valid=true;
            return obj;
        }else{
            return {valid:false}
        }
    },

    getSummary: function(fullRunData,wucdtime,maxhr) {
            var sumData = this.getSumData30Sec(fullRunData);
            var runData = this.getRunWithOutWUCD(sumData,wucdtime);//this gets running time
            var res = alasql('SELECT date, AVG(ngpKm) ngpKm, AVG(lat) lat,AVG(lon) lon, AVG(CAST([kph] AS FLOAT)) AS [kph], \
                AVG(CAST([hr] AS INT)) AS [hr], MAX(minute) minutes FROM ? GROUP BY date',[runData]);
            var outList=[];

            var outLatLon=[];
            for(var i in sumData){
                var obj=sumData[i];
                outLatLon.push({lat:this.round(obj.lat,5),lon:this.round(obj.lon,5),kph:obj.kph});
            }

            var obj = res[0];
            obj.map=outLatLon;
            obj.kph = this.round(obj.kph,2);
            obj.hr = this.round(obj.hr,0);
            var first3m = _.filter(sumData,function(obj){return obj.minute<3});
            obj.startHr = this.round(this.average(first3m,"hr"),1);
            return obj;
    },


    getRunFromFile: function(fullPath){
        if (fullPath.indexOf(".tcx") > -1){
            return this.getRunFromTcx(fullPath);
        }else if (fullPath.indexOf(".gpx") > -1) {
            return this.getRunFromGpx(fullPath);
        }else{
            var obj = {trackpoints:[],totalKm:0}
            return obj;
        }
    },


     getRunFromTcx: function(fullPath){
        var totalSeconds = 0;
        var out=[];

        var sport = this.getSport(fullPath);
 
        if (sport.toLowerCase() !="running"){
            return {trackpoints:[],totalKm:0,sport:sport};
        }

        var parser = new tcx.Parser();
        parser.parse_file(fullPath);
        var trackPonts = parser.activity.trackpoints;

        for (var i = 0; i <= trackPonts.length - 2; i++) {
            var obj={sport:sport};

            var current = trackPonts[i];
            var next =trackPonts[i+1];
            var curTime = moment(current.time);
            var nextTime = moment(next.time);
            obj.date = nextTime.format('YYYY-MM-DD hh:mm');
            obj.time = nextTime.format('HH:mm');
            obj.timeUnix = curTime.format("X");
            obj.lat = parseFloat(current.lat);
            obj.lon =parseFloat(current.lng);
            obj.lenSeconds = nextTime.diff(curTime,'seconds');
            var meters = next.dist_meters-current.dist_meters;
            obj.meters= meters;
            obj.kph = this.round((meters / 1000.0)/(obj.lenSeconds/60/60),2);//convert seconds to hours
            obj.hr =next.hr_bpm;
            obj.minute = this.round(totalSeconds/30,0) *.5;
            var temp = next.alt_meters - current.alt_meters;

            if (temp>0){
                obj.alt_metersUp = temp 
            }else{
                obj.alt_metersDown = -temp;
            }

            out.push(obj);

            totalSeconds+=obj.lenSeconds;
        }
        var totalKm =trackPonts[trackPonts.length-1].dist_meters/1000;
        var obj = {trackpoints:out,totalKm:Math.round(totalKm*100)/100}
        return obj;

    },

    getRunFromGpx: function(fullPath){
        var out=[];
        var totalSeconds = 0;
        var totalKm =0;
        var xml = fs.readFileSync(fullPath, 'utf8');
        var json = xmlParser.toJson(xml);
        obj = JSON.parse(json);
        obj.errMsg ='';
        var trackPonts = obj.gpx.trk.trkseg.trkpt;

        for (var i = 0; i <= trackpoints.length - 2; i++) {
            var obj ={};
            var cur = trackpoints[i];
            var next = trackpoints[i+1];
            var curTime=moment(cur.time);
            var nextTime=moment(next.time);

            obj.date = nextTime.format('MM/DD/YYYY');
            obj.time = nextTime.format('LTS');
            obj.timeUnix = curTime.format("X");
            obj.lat = cur.LatitudeDegrees;
            obj.lon =cur.LongitudeDegrees;
            obj.lenSeconds = nextTime.diff(curTime,'seconds');
            obj.distKm = distance(cur.lat, cur.lon,next.lat,next.lon,'K');
            obj.hrs=round((obj.lenSeconds/60/60),4);
            obj.kph = round((obj.distKm/obj.hrs),3);
            obj.hr =next.extensions['gpxtpx:TrackPointExtension']['gpxtpx:hr'];
            obj.minute = round(totalSeconds/30,0) *.5;
            totalKm += distKm;
            out.push(obj)
            totalSeconds+=obj.lenSeconds;
        }

        var obj = {trackpoints:out,totalKm:Math.round(totalKm*100)/100};
        return obj;
    },

    getSport: function(fileLocation){
        var xml = fs.readFileSync(fileLocation , 'utf8');
        var json = xmlParser.toJson(xml);
        var obj = JSON.parse(json);
        var activity = obj.TrainingCenterDatabase.Activities.Activity;
        var sport = activity.Sport; 
        return sport;   
    },


    average: function (arr,field)
    {
       return _.reduce(arr, function(memo, num) {
            return memo + num[field];

        }, 0) / (arr.length === 0 ? 1 : arr.length);
    },

     getRunWithOutWUCD: function(sumData,warmUpMin){
        var out=[];
        var analysisLenMin =12;
        var coolDown = warmUpMin;

        var runLenMinutes = sumData[sumData.length-1].minute;
        var endOfAnalysis = 0;
        var startOfAnalyis = 0;
        if (runLenMinutes>(warmUpMin+analysisLenMin)){//warmup cooldown
            startOfAnalyis=warmUpMin;
            endOfAnalysis  = warmUpMin+analysisLenMin; //total ends as upanalysisLenMin 
        } else  if (runLenMinutes>analysisLenMin){
            startOfAnalyis = runLenMinutes-analysisLenMin;
        }

        if (runLenMinutes<30) warmUpMin = 0;
        for (var i in sumData) {
            var run = sumData[i];
            if (run.minute > startOfAnalyis && run.minute< endOfAnalysis && (run.hr>80 && run.hr<220)){
                out.push(run);
            }
        }
        return out;
    },
    
    getRmssd: function(allRecords) {
        var sumDiff=this.getRMSSDTotalSquared(allRecords);
        var rMssd=Math.sqrt(sumDiff/allRecords.length);
        return rMssd;
    },

    getRMSSDTotalSquared: function(allRecords) {
        var total=0;
        var lastNumber=0;
        var curValue=0;
        for (var i in allRecords) {
            var curValue=allRecords[i];
            if (lastNumber!=0) {
                var difference =Math.abs(curValue-lastNumber);
                total += (difference*difference); //difference between current and last
            }
            lastNumber=curValue;
        }
        return total;
    },


     getRollingAverage: function(data,currentIndex,rollDays){
        if (currentIndex<(rollDays-1)){
            var avg = this.getFirstAverage(data,rollDays);
            var first=data[0].vdot;
            var increment = (avg-first)/(rollDays);
            var res= Math.abs(increment)*currentIndex+first;
            return Math.round(res*100)/100;
        }   

        var sum=0;
        var end = rollDays-1;

        for (var i = -end; i <=0 ; i++) {
            var loc =currentIndex + i;
            sum += data[loc].vdot;
        }
        var avg = sum/rollDays;
        return Math.round(avg*100)/100;
     },

     getFirstAverage: function(data, rollDays){
        var sum=0;
        var end = (rollDays-2);
        for (var i = 0; i <= end; i++) {
            sum = sum + data[i].vdot;
        }
        return sum/(end+1); 
     },


     getSumData30Sec: function(allIntervalsIn){
       var res = alasql('SELECT date, AVG(lat) lat, AVG(lon) lon,MIN(timeUnix) startTimeUnix, minute, SUM(meters) meters, SUM(alt_metersUp) altUp, SUM(alt_metersDown) altDown, AVG(CAST([kph] AS FLOAT)) AS [kph], \
              AVG(CAST([hr] AS INT)) AS [hr] FROM ? GROUP BY date,minute',[allIntervalsIn]);
        for (var i in res) {
            var obj=res[i];
            obj.minkm=pc.convert(obj.kph,'kmh').minkm;
            obj.hr=this.round(obj.hr,0);
            obj.time = moment(obj.startTimeUnix,"X").format('YYYY-MM-DD HH:mm:ss');
            obj.kph=this.round(obj.kph,2);
            obj.ngpKm=this.getNGP(obj.kph,obj.meters,obj.altUp,obj.altDown);
        }
       return res;
    },

     round: function(val,places){
        var mult =Math.pow(10,places);

        return Math.round(val*mult)/mult;
    },

    degrees: function(radians) {
      return radians * 180 / Math.PI;
    },

    getNGP: function(speedKm, distanceMeters, elevationUpMeters, elevationDownMeters){
        var angleUp = Math.asin(elevationUpMeters/distanceMeters); //1%
        var angleDown = Math.asin(elevationDownMeters/distanceMeters); //1%
        var slowDown=0;
        var speedUp=0;
        if (elevationUpMeters>0){
            slowDown = .033*speedKm*angleUp*100; 
        }
        if (elevationDownMeters>0){
            speedUp = .018*speedKm*angleDown*100; 
        }
        var final = speedKm - speedUp + slowDown;
        return final;
    },



    distance: function(lat1, lon1, lat2, lon2, unit) {
        var radlat1 = Math.PI * lat1/180
        var radlat2 = Math.PI * lat2/180
        var theta = lon1-lon2
        var radtheta = Math.PI * theta/180
        var dist = Math.sin(radlat1) * Math.sin(radlat2) + Math.cos(radlat1) * Math.cos(radlat2) * Math.cos(radtheta);
        dist = Math.acos(dist)
        dist = dist * 180/Math.PI
        dist = dist * 60 * 1.1515
        if (unit=="K") { dist = dist * 1.609344 }
        if (unit=="N") { dist = dist * 0.8684 }
        return dist
    },

    isArray: function(ar) {
      return Array.isArray(ar) ||
             (typeof ar === 'object' && objectToString(ar) === '[object Array]');
    },


    isObject: function(obj) {
      return obj === Object(obj);
    }
}

