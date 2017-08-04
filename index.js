var rfr=require('rfr'); 
var RM=rfr('run-math.js')
var rm= new RM();

exports.getRunStats = function(fileLowerCase, path, wucdtime, maxhr){
        var fullPath =path;
        if (fullPath.slice(-1) !="/"){
            fullPath = fullPath +"/";
        }
        fullPath = fullPath + fileLowerCase;

        var runObj = rm.getRunFromFile(fullPath);
        var allSegments = runObj.trackpoints;
        if (allSegments.length>0){
            var obj = rm.getSummary(allSegments,wucdtime,maxhr)
            obj.totalKm = runObj.totalKm;
            obj.fileLowerCase = fileLowerCase;
            obj.valid=true;
            return obj;
        }else{
            return {valid:false, fileLowerCase:fileLowerCase}
        }
}


