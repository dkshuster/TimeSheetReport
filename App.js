// Custom Rally App that displays Time Entries summed by Task/User/Week 1 and Week 2 in a grid and 
// filter by Iteration.
//

Ext.define('CustomApp', {
  extend: 'Rally.app.App',      
  componentCls: 'app',          

  timeStore: undefined,       
  timeGrid: undefined,
  week2Start: undefined,
  myStore: undefined,

  launch: function() {

    console.log('Sum of time Entries by Task and week');     

    this.pulldownContainer = Ext.create('Ext.container.Container', {    
      id: 'pulldown-container-id',
      layout: {
              type: 'hbox',           
              align: 'stretch'
          }
    });

    this.add(this.pulldownContainer); 

    this._loadIterations();
  },

  // create iteration pulldown and load iterations
  _loadIterations: function() {
      this.iterComboBox = Ext.create('Rally.ui.combobox.IterationComboBox', {
        fieldLabel: 'Iteration',
        labelAlign: 'right',
        width: 300,
        listeners: {
          ready: function(combobox) {             
               this._loadData();
         },
          select: function(combobox, records) {   
               this._loadData();
         },
         scope: this
       }
      });

      this.pulldownContainer.add(this.iterComboBox);   
   },

    // Get data from Rally
  _loadData: function() {

    var startDate = this.iterComboBox.getRecord().get('StartDate');    
    var myStartDate = Rally.util.DateTime.toIsoString(startDate).replace(/T.*$/,'T00:00:00.000Z');
  //  console.log ('MyStartDate  ', myStartDate);

    var endDate = this.iterComboBox.getRecord().get('EndDate');
    var myEndDate = Rally.util.DateTime.toIsoString(endDate).replace(/T.*$/,'T00:00:00.000Z');
  //  console.log ('MyEndDate  ', myEndDate);

    var week2 = Rally.util.DateTime.add(new Date(startDate), "day", 7);  
  //  console.log("Week 2 + 7", week2.getTime());
    this.week2Start = Rally.util.DateTime.toIsoString(week2).replace(/T.*$/,'T00:00:00.000Z');
    this.week2Start = new Date(this.week2Start).getTime();
 //   console.log("myWeek2 + 7 no time", this.week2Start);
 //   console.log("Week 2 = ", this.week2Start);

    //GMT (yyyy-MM-ddT00:00:00Z
    //shift the timebox time to UTC 
    var startDateFilter = Ext.create('Rally.data.QueryFilter', {
      property: 'WeekStartDate',
      operator: '>=',
      value: myStartDate
    });
    startDateFilter.toString();
 //   console.log('startDateFilter data: ' + startDateFilter);

    var endDateFilter = Ext.create('Rally.data.QueryFilter', {
      property: 'WeekStartDate',
      operator: '<',
      value: myEndDate
    });
    endDateFilter.toString();
 //   console.log('End Filter data: ' + endDateFilter);
    
    
    // if store exists, just load new data
    if (this.timeStore) {
//      console.log('time entry store exists');
      this.timeStore.setFilter([startDateFilter, endDateFilter]);
      this.timeStore.load();

    // create store
    } else {
//      console.log('creating time entry store');
      this.timeStore = Ext.create('Rally.data.wsapi.Store', {     
        model: 'TimeEntryItem',
        pageSize: 100,
        autoLoad: true,     // <----- Don't forget to set this to true! heh
        filters: [startDateFilter, endDateFilter],
        listeners: {
            load: this._onTimeEntryItemLoaded,
            scope: this
        },
        fetch: ['Task', 'TimeSpent', 'FormattedID', 'User', 'Values', 'WeekStartDate', 'ClarityProject']   // Look in the WSAPI docs online to see all fields available!
      });
    }
  },

  _onTimeEntryItemLoaded: function(store, data){
  
//    console.log(data);
 //   console.log ("week 2", this.week2Start);

    var timeEntryItems = [];
    var pendingValues = data.length;
  
    var index;

    Ext.Array.each(data, function(timeEntryItem) {

//        console.log("time entry item  = ", timeEntryItem);

        index = timeEntryItem.get('User')._refObjectName + 
                    timeEntryItem.get('Task').FormattedID + 
                        timeEntryItem.get('Task').c_ClarityProject;
        var t  = {
            key : index,
            User: timeEntryItem.get('User')._refObjectName,
            ClarityProject: timeEntryItem.get('Task').c_ClarityProject,
            FormattedID: timeEntryItem.get('Task').FormattedID,
            Task : timeEntryItem.get('Task')._refObjectName,
            Week1 : 0,
            Week2 : 0,
            Values: [],
            TimeSpent: timeEntryItem.get('Task').TimeSpent,
            WeekStartDate: timeEntryItem.data.WeekStartDate
        };
//        console.log("timeEntryItem = ", timeEntryItem);
//        console.log("t = ", t);
        var values = timeEntryItem.getCollection('Values');
        values.load({
           fetch: ['Hours', 'DateVal'],
           //autoLoad: true,
           callback: function(records, operation, success){
            Ext.Array.each(records, function(value){
                t.Values.push({Hours: value.get('Hours'),
                                DateVal: value.get('DateVal')
                            });
            }, this);
                --pendingValues;
                if (pendingValues === 0) {
  //                console.log("pending values = 0");
  //                console.log("timeentryitems", timeEntryItems);
                    this._createGrid(timeEntryItems);
                }
            },
            scope: this
        });
        timeEntryItems.push(t);
        
    }, this);
    this._createGrid(timeEntryItems);
  },

 _createGrid: function(timeEntryItems) {

// consolidate the time values and remove dup entries

  var hours = 0;
  var week1Hours = 0;
  var week2Hours = 0;
  var dateVal;
  var finalData = [];
 
  Ext.Array.each(timeEntryItems, function(record){
    var entry = {
      key : record.key,
      User: record.User,
      GroupData: record.User + "  " + record.ClarityProject,
      ClarityProject: record.ClarityProject,
      FormattedID: record.FormattedID,
      Task : record.Task,
      Week1 : 0,
      Week2 : 0,
      TimeSpent: record.TimeSpent
    };
    if ( record.Values.length > 0 ) {
      Ext.Array.each(record.Values, function(value){
//        dateVal = value.DateVal;
//        dateVal = new Date(dateVal).getTime();
//        console.log("DateVal = ", dateVal);
        hours += value.Hours;
       
      }, this);
      dateVal = new Date(record.WeekStartDate).getTime();
 //     console.log("Dateval = ", dateVal);
 //     console.log("week2startdate =  = ", this.week2Start);

      if (dateVal >= this.week2Start) {
        week2Hours = hours;
//              console.log("in week 2");
//              console.log("week 2 hours", week2Hours);
      }
      else {
        week1Hours = hours;
//              console.log("in week 1");
//              console.log("week 1 hours", week1Hours);
      }
    }

    var location = finalData.findIndex(entry => entry.key === record.key);
//      console.log("Index", index);
//      console.log("Location = ", location);
      if ( location > -1 ) {
//          console.log("Found existing Entry for" , index);
          //update week 1 and week 2 here
        finalData[location].Week1 += week1Hours;
        finalData[location].Week2 += week2Hours;
      }
      else {
        if ( week1Hours > 0 || week2Hours > 0) {
          entry.Week1 += week1Hours;
          entry.Week2 += week2Hours;
          finalData.push(entry);
        }
      }
//        console.log("t = ", t);
        week1Hours = 0;
        week2Hours = 0;
        hours = 0;
  }, this);


  console.log("FinalData = ", finalData);

//  if (this.myStore) {
//    console.log('store exists');
//    this.myStore.load();

  // create store
//  } else {
    console.log('final data store does not exist');
    this.myStore = Ext.create('Rally.data.custom.Store', {
      data: finalData,
//      groupField: 'ClarityProject',
      groupField: 'GroupData',
      pageSize: 100,  
      autoload: true
    }, this);
//  }

  console.log("final data custom store", this.myStore);
  
  if (!this.grid) {
    console.log("create grid");
    this.grid = Ext.create('Rally.ui.grid.Grid', {
      store: this.myStore,
      features: [{ftype:'groupingsummary'}],
      columnCfgs: [
        {
           text: 'User', dataIndex: 'User',
           summaryRenderer: function() {
               return "Totals:"; 
           }
        },
        {
           text: 'Clarity Project', dataIndex: 'ClarityProject'
        },
        {
            text: 'Task ID', dataIndex: 'FormattedID'
        },
        {
            text: 'Task', dataIndex: 'Task'
        },
        {
           text: 'Week 1', dataIndex: 'Week1', 
           summaryType: 'sum'    // sum the next 2 columns data for each week group
       },
       {
            text: 'Week 2', dataIndex: 'Week2',
          summaryType: 'sum'
       },
       {
            text: 'Time Spent', dataIndex: 'TimeSpent',
            summaryType: 'sum'
          
       }
      ]
    });
    this.add(this.grid);
  }
  else {
    console.log("grid exists");
    this.grid.reconfigure(this.myStore);
  }
},


});