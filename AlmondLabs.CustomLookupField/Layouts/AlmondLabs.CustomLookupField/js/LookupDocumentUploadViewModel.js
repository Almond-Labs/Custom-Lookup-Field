function LookupItemModel(ctx, fieldName) {
    var self = this;
    self.OriginalItem = ctx.CurrentItem;
    self.Id = ctx.CurrentItem.ID ? ctx.CurrentItem.ID : ctx.FormContext.itemAttributes.Id;
    self.Title = ctx.CurrentItem.Title;
    self.Data = ko.observableArray([]);
    self.Data.subscribe(function (newValue) {
        if (self.Field()) {
            for (var x = 0; x < newValue.length; x++) {
                if (!newValue[x].TargetItem())
                    self.LoadTargetItem(newValue[x]);
            }
        }
    });
    self.Field = ko.observable();
    self.Field.subscribe(function (newValue) {
        for (var x = 0; x < self.Data().length; x++) {
            self.LoadTargetItem(self.Data()[x]);
        }
    });

    self.LoadTargetItem = function (item) {
        jQuery.SP.API.GetItemModifiedEditor(self.Field().TargetListId, item.lookupId).done(item.TargetItem);
    };

    self.ReadLookup = function (fieldName) {
        var value = self.OriginalItem[fieldName];
        return value instanceof Array ?
            value :
            self.ParseLookup(value);
    };

    self.ParseLookup = function (value) {
        var ret = new Array();
        var parts = value.split(";#");
        for (var x = 0; x < parts.length / 2 && value.length > 0; x++) {
            var obj = { lookupId: parts[x * 2], lookupValue: parts[x * 2 + 1] };
            ret[x] = obj;
        }

        return ret;
    };

    self.AddItem = function (item) {
        item.TargetItem = ko.observable();
        self.Data.push(item)
    }

    jQuery.SP.API.GetLookupField(ctx.listId, fieldName).done(function (data) {
        var fields = data.d.results ? data.d.results : data.d;
        var x; for (x = 0; x < fields.length && fields[x].InternalName != fieldName; x++) { }

        if (x < fields.length) {
            self.Field({
                FieldId: fields[x].Id,
                FieldName: fields[x].LookupField,
                TargetWebId: fields[x].LookupWebId,
                TargetListId: fields[x].LookupList.replace(/{|}/g, "")
            });
        }
    });

    var data = self.ReadLookup(fieldName);
    for (var x = 0; x < data.length; x++) {
        var item = data[x];
        self.AddItem(item);
    }
}

function LookupDocumentUploadModel(ctx, fieldName, mode) {
    var self = this;
    self.FieldName = fieldName;
    self.Context = ko.observable();
    self.Item = ko.observable();
    self.ContainerId = ko.computed(function () {
        if (self.Context() && self.Item())
            return self.Context().listId + "_" + self.Item().Id;

        return null;
    });
    self.FileInputId = ko.computed(function () {
        if (self.ContainerId())
            return "input_" + self.ContainerId();

        return null;
    });
    self.Mode = ko.observable("Display");
    self.FileInputValue = ko.observableArray();
    //Document upload start
    self.FileInputValue.subscribe(function (newValue) {
        var files = document.getElementById(self.FileInputId()).files;
        self.FilesToUpload.removeAll();
        for (var x = 0; x < files.length; x++) {
            files[x].UploadProgress = ko.observable();
            files[x].Error = ko.observable();
            self.FilesToUpload.push(files[x]);
        }
    });
    self.FilesToUpload = ko.observableArray();
    self.LookupSearchValue = ko.observable();
    self.LookupSearchValue.subscribe(function (newValue) {
        if (newValue && newValue.length > 0) {
            jQuery.SP.API.QueryListByField(self.Item().Field().TargetListId, self.Item().Field().FieldName, newValue).done(function (results) {
                self.LookupSearchResults(results);
            });
        }
        else {
            self.LookupSearchResults.removeAll();
        }
    });
    self.LookupSearchResults = ko.observableArray();

    self.AddSearchItem = function (item) {
        self.Item().AddItem({ lookupId: item.Id, lookupValue: item[self.Item().Field().FieldName] });
        self.LookupSearchValue("");
    };

    self.BrowseClick = function () {
        jQuery("#" + self.FileInputId()).click();
    };

    self.ShowTargetDocument = function (targetItem) {
        jQuery.SP.API.GetListDisplayForm(self.Item().Field().TargetListId).done(function (formUrl) {
            var options = {
                title: targetItem.lookupValue, url: formUrl + "?ID=" + targetItem.lookupId, width: 500, height: 500, allowMaximize: true, showClose: true, dialogReturnValueCallback: function (dialogResult, returnValue) {
                    //SP.SOD.execute('sp.ui.dialog.js', 'SP.UI.ModalDialog.RefreshPage', SP.UI.DialogResult.OK);
                }
            };

            SP.SOD.execute('sp.ui.dialog.js', 'SP.UI.ModalDialog.showModalDialog', options);
        });
    };

    self.ToggleDisplayItems = function (model, event) {
        var elem = event.originalEvent.originalTarget;
        if (!elem)
            elem = event.originalEvent.srcElement;

        jQuery(elem).parent().parent().children(".DisplayItems").toggle(100);
    };

    self.RemoveItem = function (item) {
        self.Item().Data.remove(item);
    };

    //Document upload
    self.UploadFiles = function () {
        if (!window.FileReader) {
            alert("Nope");
            return;
        }

        for (var x = 0; x < self.FilesToUpload().length; x++) {
            self.ReadFile(self.FilesToUpload()[x]).done(self.UploadFile);
        }
    };

    //Document upload
    self.ReadFile = function (file) {
        var dfd = jQuery.Deferred();
        var reader = new FileReader();
        reader.onload = function (e) {
            dfd.resolve(file, e.target.result);
        }
        reader.onerror = function (e) {
            dfd.reject(e.target.error);
        }
        reader.readAsArrayBuffer(file);
        return dfd;
    };

    //Document upload
    self.UploadFile = function (file, buffer) {
        jQuery.SP.API.UploadFile(self.Item().Field().TargetListId, file.name, buffer).progress(function (percentComplete) {
            file.UploadProgress(percentComplete);
        }).done(function (data) {
            self.FilesToUpload.remove(file);
            data.TargetItem = ko.observable();
            self.Item().AddItem(data);
        }).fail(function (err) {
            file.Error(err);
        });
    };

    self.LoadContext = function (ctx) {
        ctx.listId = ctx.listName ? ctx.listName.replace(/{|}/g, "") : ctx.FormContext.listAttributes.Id;
        self.Context(ctx);
        self.Item(new LookupItemModel(ctx, self.FieldName));
    };

    self.Bound = false;
    self.Bind = function () {
        if (!self.Bound && self.ContainerId()) {
            self.Bound = true;
            var elem = document.getElementById(self.ContainerId());
            jQuery(elem).load("/_layouts/15/AlmondLabs.CustomLookupField/ko/LookupDocumentUpload.html", function () {
                ko.applyBindings(self, elem);
            });
        }
    };

    self.IsFirefox = ko.observable(typeof InstallTrigger !== 'undefined');

    self.toString = function () {
        return "<div id='" + self.ContainerId() + "'></div>";
    };

    self.Save = function () {
        var ret = new Array();
        for (var x = 0; x < self.Item().Data().length; x++) {
            var item = self.Item().Data()[x];
            ret[x] = item.lookupId + ";#" + item.lookupValue;
        }
        return ret.join(";#");
    };

    self.LoadContext(ctx);
    self.Mode(mode);
    if (mode == "Edit") {
        var formCtx = SPClientTemplates.Utility.GetFormContextForCurrentField(ctx);
        formCtx.registerGetValueCallback(formCtx.fieldName, self.Save);
    }
}