var rfr=require('rfr')
var rs=rfr('index.js');

var res = rs.getRunStats("test.tcx", __dirname, 12, 187);
res.map=[];
console.log(res)
