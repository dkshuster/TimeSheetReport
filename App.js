// Custom Rally App that displays Time Entries summed by Task/User Week 1 and Week 2 in a grid and 
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
    console.log('Sum of time Entries by User/Task and week');     
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
        fieldLabel: 'Select Iteration',
        labelAlign: 'right',
        width: 300,
        listeners: {
          ready: function() {       
//              console.log("in ready listener");      
               this._loadData();
         },
          select: function() {   
//            console.log("in select listener");      
            this._loadData();
         },
         scope: this
       }
      });

      this.pulldownContainer.add(this.iterComboBox);   
   },

    // Get data from Rally
  _loadData: function() {

    // get, calculate, and adjust the applicable dates
    // must be GMT form (yyyy-MM-ddT00:00:00Z
    // shift the timebox time to UTC 
    var startDate = this.iterComboBox.getRecord().get('StartDate');    
    var myStartDate = Rally.util.DateTime.toIsoString(startDate).replace(/T.*$/,'T00:00:00.000Z');
  
    var endDate = this.iterComboBox.getRecord().get('EndDate');
    var myEndDate = Rally.util.DateTime.toIsoString(endDate).replace(/T.*$/,'T00:00:00.000Z');
  
    var week2 = Rally.util.DateTime.add(new Date(startDate), "day", 7);  
    this.week2Start = Rally.util.DateTime.toIsoString(week2).replace(/T.*$/,'T00:00:00.000Z');
    this.week2Start = new Date(this.week2Start).getTime();
 
    var startDateFilter = Ext.create('Rally.data.QueryFilter', {
      property: 'WeekStartDate',
      operator: '>=',
      value: myStartDate
    });
    startDateFilter.toString();
 
    var endDateFilter = Ext.create('Rally.data.QueryFilter', {
      property: 'WeekStartDate',
      operator: '<',
      value: myEndDate
    });
    endDateFilter.toString();

    var tasksOnlyFilter = Ext.create('Rally.data.QueryFilter', {
      property: 'TaskDisplayString',
      operator: '!=',
      value: ''
    });
    tasksOnlyFilter.toString();
     
    // if store exists, just load new data
    if (this.timeStore) {
      this.timeStore.setFilter([startDateFilter, endDateFilter, tasksOnlyFilter]);
      this.timeStore.load();

    // otherwise create store
    } else {
      this.timeStore = Ext.create('Rally.data.wsapi.Store', {     
        model: 'TimeEntryItem',
        pageSize: 100,
        autoLoad: true,     // <----- Don't forget to set this to true to load data 
        filters: [startDateFilter, endDateFilter, tasksOnlyFilter],
        listeners: {
            load: this._onTimeEntryItemLoaded,
            scope: this
        },
        fetch: ['Task', 'TimeSpent', 'FormattedID', 'User', 'Values', 'WeekStartDate', 'ClarityProjectTask','TaskDisplayString']   // Look in the WSAPI docs online to see all fields available!
      });
    }
//    console.log("TimeStore = ", this.timeStore );
  },

  _onTimeEntryItemLoaded: function(store, data){

    var timeEntryItems = [];
    var pendingValues = data.length;
    var index;
    // gather up all the timeentries, remove dupes
//    console.log("Data = ", data);

    Ext.Array.each(data, function(timeEntryItem) {
//      console.log("TimeEntryITem = ", timeEntryItem);
      if (timeEntryItem.data.Task !== null ) {
        index = timeEntryItem.get('User')._refObjectName + 
                    timeEntryItem.get('Task').FormattedID + 
                        timeEntryItem.get('Task').c_ClarityProjectTask;
//            console.log(" Index = ", index);
        var t  = {
            key : index,
            User: timeEntryItem.get('User')._refObjectName,
            ClarityProjectTask: timeEntryItem.get('Task').c_ClarityProjectTask,
            FormattedID: timeEntryItem.get('Task').FormattedID,
            Task : timeEntryItem.get('Task')._refObjectName,
            Week1 : 0,
            Week2 : 0,
            Values: [],
            TimeSpent: timeEntryItem.get('Task').TimeSpent,
            WeekStartDate: timeEntryItem.data.WeekStartDate
        };
        // add the time values per each timeentry to be processed later  
        var values = timeEntryItem.getCollection('Values');
        values.load({
           fetch: ['Hours', 'DateVal'],
           callback: function(records){
            Ext.Array.each(records, function(value){
                t.Values.push({Hours: value.get('Hours'),
                                DateVal: value.get('DateVal')
                            });
            }, this);
                --pendingValues;
                if (pendingValues === 0) {
                    this._createGrid(timeEntryItems);
                }
            },
            scope: this
        });
        timeEntryItems.push(t);
      }
      else {
        --pendingValues;
      }
        
    }, this);
    this._createGrid(timeEntryItems);
  },

 _createGrid: function(timeEntryItems) {

  var hours = 0;
  var week1Hours = 0;
  var week2Hours = 0;
  var dateVal;
  var finalData = [];
  // process the time entries and values into a single line for each unique key
  Ext.Array.each(timeEntryItems, function(record){
    var entry = {
      key : record.key,
      User: record.User,
      GroupData: record.User + "  " + record.ClarityProjectTask, // key is User and CLarity project
      ClarityProjectTask: record.ClarityProjectTask,
      FormattedID: record.FormattedID,
      Task : record.Task,
      Week1 : 0,
      Week2 : 0,
      TimeSpent: record.TimeSpent
    };
    if ( record.Values.length > 0 ) {
      Ext.Array.each(record.Values, function(value){
        hours += value.Hours;
      }, this);
      dateVal = new Date(record.WeekStartDate).getTime();

      if (dateVal >= this.week2Start) {
        week2Hours = hours;
      }
      else {
        week1Hours = hours;
      }
    }

    var location = finalData.findIndex(entry => entry.key === record.key);
      if ( location > -1 ) {
          //if an entry already exists
          // just update week 1 and week 2 totals
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
        week1Hours = 0;
        week2Hours = 0;
        hours = 0;
  }, this);
    this.myStore = Ext.create('Rally.data.custom.Store', {
      data: finalData,
      groupField: 'GroupData',
      pageSize: 100,  
      autoload: true
    }, this);
  
  if (!this.grid) {
//    console.log("create grid");
    this.grid = Ext.create('Rally.ui.grid.Grid', {
      store: this.myStore,
      features: [{ftype:'groupingsummary'}],
      showRowActionsColumn: false,
      columnCfgs: [
        {
           text: 'User', dataIndex: 'User',
           summaryRenderer: function() {
               return "Totals:"; 
           }
        },
        {
           text: 'Clarity Project Task', dataIndex: 'ClarityProjectTask'
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
       {    // put this out just for cross ref of the task total hours.
            text: 'Time Spent', dataIndex: 'TimeSpent',
            summaryType: 'sum'
          
       }
      ]
    });
    this.add(this.grid);
  }
  else {
    this.grid.reconfigure(this.myStore);
  }
},


});