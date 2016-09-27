Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',
    items: [
        {
            xtype: 'container',
            itemId: 'exportBtn',
            cls: 'export-button'
        },
        {
            xtype: 'container',
            itemId: 'milestoneCombobox',
            cls: 'milestone-combo-box'
        },
        {
            xtype: 'container',
            itemId: 'gridContainer'
        }
    ],
    launch: function() {
        this._myMask = new Ext.LoadMask(Ext.getBody(), {msg:"Loading data..."});
        this._myMask.show();
        
        this.down('#milestoneCombobox').add({
            xtype: 'rallymilestonecombobox',
            itemId: 'stateComboBox',
            allowNoEntry: true,
            model: ['TestCase'],
            listeners: {
                scope: this,
                select: this._onSelect,
                ready: this._initStore
            },
        });
   },
    _getStateFilter: function() {
        return {
            property: 'WorkProductMilestone',
            operator: '=',
            value: this.down('#stateComboBox').getRawValue()
        };
    },
    _onSelect: function() {
        var store = this._grid.getStore();
    
        store.clearFilter(true);
        if (this.down('#stateComboBox').getRawValue() !== "-- No Entry --") {
            store.filter(this._getStateFilter());
        } else {
            store.reload();
        }
    },
   _initStore: function() {
        this._defectsStore = Ext.create('Rally.data.wsapi.Store', {
            model: 'Defect',
            autoLoad: true,
            remoteSort: false,
            fetch:[
            	"FormattedID",
            	"State",
            	"TestCase"
        	],
            limit: Infinity
        });
       
        Ext.create('Rally.data.wsapi.Store', {
            model: 'TestCase',
            autoLoad: true,
            remoteSort: false,
            fetch:[
        	    "FormattedID", 
            	"Name",
            	"Type",
            	"LastRun",
            	"LastVerdict",
            	"LastBuild",
            	"WorkProduct",
            	"Milestones",
            	"Defects"
        	],
            limit: Infinity,
            listeners: {
                load: this._onDataLoaded,
                scope:this
            }
        });
    },
    _onDataLoaded: function(store, data) {
        _.each(data, function(testcase) {
            if(testcase.data.WorkProduct) {
                var testCaseMilestones = [];
                _.each(testcase.data.WorkProduct.Milestones._tagsNameArray, function(milestone) {
                    testCaseMilestones.push(milestone.Name);
                }, this);
                var workProductMilestone = testCaseMilestones.join(', ');
                testcase.set('WorkProductMilestone', workProductMilestone);
                testcase.set('WorkProductNumericID', Number(testcase.data.WorkProduct.FormattedID.replace(/\D+/g, '')));
            }
            if (testcase.data.Defects && testcase.data.Defects.Count > 0) {
                var defectHtml = [];
                _.each(this._defectsStore.data.items, function(defect) {
                    if (defect.data.TestCase && defect.data.TestCase.FormattedID === testcase.data.FormattedID) {
                        defectHtml.push('<a href="' + Rally.nav.Manager.getDetailUrl(defect) + '">' + defect.data.FormattedID + "</a> - " + defect.data.State);
                    }
                }, this);
                testcase.set('OpenDefects', defectHtml.join("</br>"));
            }
        }, this);
        this._makeGrid(data);
    },
    
    _makeGrid:function(testcases){
        this._myMask.hide();
        var store = Ext.create('Rally.data.custom.Store', {
            data: testcases,
            proxy: {
                type:'memory'
            }
        });
        this._testcases = testcases;
        this._grid = Ext.create('Rally.ui.grid.Grid',{
            itemId: 'testcasesGrid',
            store: store,
            showRowActionsColumn: false,
            showPagingToolbar: false,
            columnCfgs: [
                { 
                	text: "Test Case ID", dataIndex: "FormattedID", xtype: "templatecolumn",
                	tpl: Ext.create("Rally.ui.renderer.template.FormattedIDTemplate"),
                }, {
                    text: "Test Case Name", dataIndex: "Name", flex: 1
                }, {
                    text: "Test Case Type", dataIndex: "Type"
                }, {
                    text: "Work Product ID", dataIndex: "WorkProduct",
                    renderer: function(value) {
                        return value ? '<a href="' + Rally.nav.Manager.getDetailUrl(value) + '">' + value.FormattedID + "</a>" : void 0;
                    },
                    getSortParam: function() {
                        return "WorkProductNumericID";  
                    }
                }, {
                    text: "Test Case Last Run", dataIndex: "LastRun"
                }, {
                    text: "Test Case Last Build", dataIndex: "LastBuild"
                }, {
                    text: "Test Case Last Verdict", dataIndex: "LastVerdict", sortable: false
                }, {
                    text: "Defects", dataIndex: "OpenDefects"
                }
            ]
        });
        this.down('#gridContainer').add(this._grid);
        this.down('#exportBtn').add({
            xtype: 'rallybutton',
            text: 'Export to CSV',
            handler: this._onClickExport,
            scope: this
        });
    },

    _onClickExport: function(){
        var data = this._getCSV();
        window.location = 'data:text/csv;charset=utf8,' + encodeURIComponent(data);
    },
    
    _getCSV: function () {
        var cols    = this._grid.columns;
        var data = '';
        
        _.each(cols, function(col) {
            data += this._getFieldTextAndEscape(col.text) + ',';
        }, this);
        data += "Milestones,";
        data += "\r\n";

        _.each(this._testcases, function(record) {
            _.each(cols, function(col) {
                var fieldName = col.dataIndex;
                if (fieldName ==="WorkProduct" && record.data.WorkProduct) {
                    data += this._getFieldTextAndEscape(record.data.WorkProduct.FormattedID) + ',';
                } else if (fieldName ==="LastRun") {
                    var text = '';
                    if (record.data.LastRun) {
                        text = record.data.LastRun.toString();
                    }
                    data += this._getFieldTextAndEscape(text) + ',';
                } else if (fieldName === "OpenDefects" && record.data.OpenDefects) {
                    var text = '\"';
                    _.each(this._defectsStore.data.items, function(defect) {
                        if (defect.data.TestCase && defect.data.TestCase.FormattedID === record.data.FormattedID) {
                            text += defect.data.FormattedID + ' - ' + defect.data.State + '\n';
                        }
                    }, this);
                    text += '\"';
                    data += text + ',';
                } else {
                    data += this._getFieldTextAndEscape(record.get(fieldName)) + ',';
                }
            }, this);
            data += this._getMilestonesForCSV(record);
            data += "\r\n";
        }, this);

        return data;
    },
    _getMilestonesForCSV: function(testcases) {
        var milestones = '';
        if(testcases.data.WorkProduct) {
            _.each(testcases.data.WorkProduct.Milestones._tagsNameArray, function(milestone) {
                milestones += this._getFieldTextAndEscape(milestone.Name) + ' ';
            }, this);
        }
        return milestones;
    },
    _getFieldTextAndEscape: function(fieldData) {
        var string  = this._getFieldText(fieldData);  
        return this._escapeForCSV(string);
    },
    _getFieldText: function(fieldData) {
        var text;
        if (fieldData === null || fieldData === undefined || !fieldData.match) {
            text = '';
        } else if (fieldData._refObjectName) {
            text = fieldData._refObjectName;
        }else {
            text = fieldData;
        }
        return text;
    },
     _escapeForCSV: function(string) {
        if (string.match(/,/)) {
            if (!string.match(/"/)) {
                string = '"' + string + '"';
            } else {
                string = string.replace(/,/g, ''); 
            }
        }
        return string;
    }
});